require "rails_helper"

RSpec.describe Api::AlbumsController, type: :controller do
  let(:user) { create(:user) }
  let(:other_user) { create(:user) }

  def index_ids = JSON.parse(response.body).fetch("data").map { |a| a["id"].to_i }

  describe "GET #index" do
    before { sign_in user }

    it "returns http ok" do
      get :index, as: :json
      expect(response).to have_http_status(:ok)
    end

    it "returns only the current user's albums" do
      own = create_list(:album, 2, user: user)
      create(:album, user: other_user)

      get :index, as: :json

      ids = JSON.parse(response.body).dig("data").map { |a| a["id"].to_i }
      expect(ids).to match_array(own.map(&:id))
    end

    it "includes pagination meta" do
      get :index, as: :json

      meta = JSON.parse(response.body)["meta"]
      expect(meta.keys).to match_array(%w[current_page total_pages total_count per_page])
    end

    it "returns page 2 when requested" do
      allow(Kaminari.config).to receive(:default_per_page).and_return(2)
      create_list(:album, 3, user: user)

      get :index, params: { page: 2 }, as: :json

      meta = JSON.parse(response.body)["meta"]
      expect(meta["current_page"]).to eq(2)
    end

    it "returns the newest album first" do
      older = create(:album, user: user, created_at: 2.days.ago)
      newer = create(:album, user: user, created_at: 1.day.ago)

      get :index, as: :json

      expect(index_ids).to eq([ newer.id, older.id ])
    end

    it "breaks a created_at tie on id, descending" do
      same_moment = 1.day.ago
      first = create(:album, user: user, created_at: same_moment)
      second = create(:album, user: user, created_at: same_moment)

      get :index, as: :json

      expect(index_ids).to eq([ second.id, first.id ])
    end

    context "with ?q=" do
      it "returns only albums whose name matches, case-insensitively" do
        match = create(:album, user: user, name: "Summer Holiday")
        create(:album, user: user, name: "Winter")

        get :index, params: { q: "summer" }, as: :json

        expect(index_ids).to eq([ match.id ])
      end

      it "never returns another user's matching album" do
        create(:album, user: other_user, name: "Summer")

        get :index, params: { q: "summer" }, as: :json

        expect(index_ids).to be_empty
      end

      it "pages over the matches rather than over every album" do
        allow(Kaminari.config).to receive(:default_per_page).and_return(2)
        create_list(:album, 3, user: user, name: "Other")
        matches = create_list(:album, 3, user: user, name: "Summer")

        get :index, params: { q: "summer", page: 2 }, as: :json

        expect(index_ids).to eq([ matches.first.id ])
      end
    end

    context "without a token" do
      before { sign_out user }

      it "returns http unauthorized" do
        get :index, as: :json
        expect(response).to have_http_status(:unauthorized)
      end
    end
  end

  describe "GET #show" do
    before { sign_in user }

    let(:album) { create(:album, user: user) }

    it "returns http ok" do
      get :show, params: { id: album.id }, as: :json
      expect(response).to have_http_status(:ok)
    end

    it "returns 404 for another user's album" do
      other_album = create(:album, user: other_user)
      get :show, params: { id: other_album.id }, as: :json
      expect(response).to have_http_status(:not_found)
    end

    context "without a token" do
      before { sign_out user }

      it "returns http unauthorized" do
        get :show, params: { id: album.id }, as: :json
        expect(response).to have_http_status(:unauthorized)
      end
    end
  end

  describe "POST #create" do
    before { sign_in user }

    let(:valid_params) { { album: { name: "Vacation", description: "Summer 2026" } } }

    it "returns http ok" do
      post :create, params: valid_params, as: :json
      expect(response).to have_http_status(:ok)
    end

    it "creates an album scoped to the current user" do
      expect { post :create, params: valid_params, as: :json }
        .to change { Album.with_user(user).count }.by(1)
    end

    it "returns the created album" do
      post :create, params: valid_params, as: :json
      json = JSON.parse(response.body)
      expect(json.dig("data", "attributes", "name")).to eq("Vacation")
    end

    context "with a missing name" do
      it "returns http unprocessable entity" do
        post :create, params: { album: { name: "" } }, as: :json
        expect(response).to have_http_status(:unprocessable_content)
      end

      it "returns a name error" do
        post :create, params: { album: { name: "" } }, as: :json
        json = JSON.parse(response.body)
        expect(json.dig("errors", "name")).to include("can't be blank")
      end
    end

    context "without a token" do
      before { sign_out user }

      it "returns http unauthorized" do
        post :create, params: valid_params, as: :json
        expect(response).to have_http_status(:unauthorized)
      end
    end
  end

  describe "PATCH #update" do
    before { sign_in user }

    let(:album) { create(:album, user: user, name: "Old Name") }

    it "returns http ok" do
      patch :update, params: { id: album.id, album: { name: "New Name" } }, as: :json
      expect(response).to have_http_status(:ok)
    end

    it "updates the album" do
      patch :update, params: { id: album.id, album: { name: "New Name" } }, as: :json
      expect(album.reload.name).to eq("New Name")
    end

    it "returns 404 for another user's album" do
      other_album = create(:album, user: other_user)
      patch :update, params: { id: other_album.id, album: { name: "Hacked" } }, as: :json
      expect(response).to have_http_status(:not_found)
    end

    context "without a token" do
      before { sign_out user }

      it "returns http unauthorized" do
        patch :update, params: { id: album.id, album: { name: "New Name" } }, as: :json
        expect(response).to have_http_status(:unauthorized)
      end
    end
  end

  describe "DELETE #destroy" do
    before { sign_in user }

    let!(:album) { create(:album, user: user) }
    let(:success_result) { Images::Result.new(success?: true, record: nil, error: nil) }
    let(:failure_result) { Images::Result.new(success?: false, record: nil, error: "Could not delete images from S3: access denied") }

    context "when the service succeeds" do
      before { allow(Images::AlbumDestroy).to receive(:call).and_return(success_result) }

      it "returns http no content" do
        delete :destroy, params: { id: album.id }, as: :json
        expect(response).to have_http_status(:no_content)
      end
    end

    context "when the service fails" do
      before { allow(Images::AlbumDestroy).to receive(:call).and_return(failure_result) }

      it "returns http unprocessable content" do
        delete :destroy, params: { id: album.id }, as: :json
        expect(response).to have_http_status(:unprocessable_content)
      end

      it "renders the error message" do
        delete :destroy, params: { id: album.id }, as: :json
        json = JSON.parse(response.body)
        expect(json["errors"]).to include("Could not delete images from S3")
      end
    end

    it "returns 404 for another user's album" do
      other_album = create(:album, user: other_user)
      delete :destroy, params: { id: other_album.id }, as: :json
      expect(response).to have_http_status(:not_found)
    end

    context "without a token" do
      before { sign_out user }

      it "returns http unauthorized" do
        delete :destroy, params: { id: album.id }, as: :json
        expect(response).to have_http_status(:unauthorized)
      end
    end
  end
end
