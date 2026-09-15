require "rails_helper"

RSpec.describe Api::AlbumsController, type: :controller do
  let(:user) { create(:user) }
  let(:other_user) { create(:user) }

  def index_ids = JSON.parse(response.body).fetch("data").map { |a| a["id"].to_i }
  def attributes = JSON.parse(response.body).fetch("data").fetch("attributes")
  def row_attributes = JSON.parse(response.body).fetch("data").map { it["attributes"] }

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

    context "with a tree" do
      # root ─┬─ madrid ── day_two
      #       └─ lisbon
      let!(:root) { create(:album, user: user, name: "Trips") }
      let!(:madrid) { create(:album, user: user, name: "Madrid", parent: root) }
      let!(:day_two) { create(:album, user: user, name: "Day 2", parent: madrid) }
      let!(:lisbon) { create(:album, user: user, name: "Lisbon", parent: root) }

      it "returns top-level folders only" do
        get :index, as: :json

        expect(index_ids).to eq([ root.id ])
      end

      it "returns one folder's children with ?parent_id=" do
        get :index, params: { parent_id: root.id }, as: :json

        expect(index_ids).to eq([ lisbon.id, madrid.id ])
      end

      it "returns 404 for another user's ?parent_id=" do
        stranger = create(:album, user: other_user)

        get :index, params: { parent_id: stranger.id }, as: :json

        expect(response).to have_http_status(:not_found)
      end

      it "carries parent_id on every row" do
        get :index, params: { parent_id: root.id }, as: :json

        expect(row_attributes.map { it["parent_id"] }).to all(eq(root.id))
      end

      it "searches the whole forest under ?q=, at any depth" do
        get :index, params: { q: "day" }, as: :json

        expect(index_ids).to eq([ day_two.id ])
      end

      it "ignores the level entirely under ?q=, so parent_id does not narrow it" do
        get :index, params: { q: "day", parent_id: root.id }, as: :json

        expect(index_ids).to eq([ day_two.id ])
      end

      it "gives each search hit its path, since sibling names may repeat" do
        get :index, params: { q: "day" }, as: :json

        expect(row_attributes.first["ancestors"]).to eq(
          [ { "id" => root.id, "name" => "Trips" }, { "id" => madrid.id, "name" => "Madrid" } ]
        )
      end

      it "computes the whole page's paths in one query" do
        queries = count_selects { get :index, params: { q: "i" }, as: :json }

        expect(queries.grep(/WITH RECURSIVE chain/).size).to eq(1)
      end

      it "leaves ancestors off a plain level listing, which needs no path" do
        get :index, params: { parent_id: root.id }, as: :json

        expect(row_attributes.first).not_to have_key("ancestors")
      end

      describe "?exclude_subtree=" do
        it "hides the folder and everything under it, so the picker cannot offer a cycle" do
          get :index, params: { q: "i", exclude_subtree: madrid.id }, as: :json

          expect(index_ids).not_to include(madrid.id, day_two.id)
        end

        it "leaves the folder's ancestors and siblings alone" do
          get :index, params: { q: "i", exclude_subtree: madrid.id }, as: :json

          expect(index_ids).to include(root.id)
        end

        it "returns 404 for another user's folder" do
          stranger = create(:album, user: other_user)

          get :index, params: { exclude_subtree: stranger.id }, as: :json

          expect(response).to have_http_status(:not_found)
        end
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

    # #resources is one level of the tree. If the member actions went through it, every
    # folder below the top level would answer 404.
    it "reaches a folder at any depth, not only a top-level one" do
      nested = create(:album, user: user, parent: create(:album, user: user, parent: album))

      get :show, params: { id: nested.id }, as: :json

      expect(response).to have_http_status(:ok)
    end

    it "carries the breadcrumb trail, root first and without the folder itself" do
      parent = create(:album, user: user, name: "Trips")
      nested = create(:album, user: user, name: "Madrid", parent: parent)

      get :show, params: { id: nested.id }, as: :json

      expect(attributes["ancestors"]).to eq([ { "id" => parent.id, "name" => "Trips" } ])
    end

    it "carries an empty trail for a top-level folder" do
      get :show, params: { id: album.id }, as: :json

      expect(attributes["ancestors"]).to eq([])
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

    context "with a parent" do
      it "creates the folder underneath it" do
        parent = create(:album, user: user)

        post :create, params: { album: { name: "Madrid", parent_id: parent.id } }, as: :json

        expect(attributes["parent_id"]).to eq(parent.id)
      end

      # 404, not 422: the same answer show gives for a folder that is not theirs, so the
      # API never confirms a stranger's id exists.
      it "returns 404 when the parent belongs to somebody else" do
        stranger = create(:album, user: other_user)

        post :create, params: { album: { name: "Madrid", parent_id: stranger.id } }, as: :json

        expect(response).to have_http_status(:not_found)
      end

      # A new folder has no descendants, so there is no cycle to check and nothing to
      # serialise against.
      it "takes no tree lock" do
        parent = create(:album, user: user)

        expect(User).not_to receive(:lock)
        post :create, params: { album: { name: "Madrid", parent_id: parent.id } }, as: :json
      end
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

    describe "moving the folder" do
      let!(:destination) { create(:album, user: user) }

      it "files it under the new parent" do
        patch :update, params: { id: album.id, album: { parent_id: destination.id } }, as: :json

        expect(album.reload.parent_id).to eq(destination.id)
      end

      # Strong parameters already tell these two apart: an omitted key is absent from the
      # permitted hash, an explicit null is present and nil.
      it "leaves the folder where it is when parent_id is omitted" do
        album.update!(parent: destination)

        patch :update, params: { id: album.id, album: { name: "Renamed" } }, as: :json

        expect(album.reload.parent_id).to eq(destination.id)
      end

      it "moves the folder to the top level when parent_id is explicitly null" do
        album.update!(parent: destination)

        patch :update, params: { id: album.id, album: { parent_id: nil } }, as: :json

        expect(album.reload.parent_id).to be_nil
      end

      it "returns 404 when the new parent belongs to somebody else" do
        stranger = create(:album, user: other_user)

        patch :update, params: { id: album.id, album: { parent_id: stranger.id } }, as: :json

        expect(response).to have_http_status(:not_found)
        expect(album.reload.parent_id).to be_nil
      end

      it "returns 422 when the new parent is one of the folder's own subfolders" do
        child = create(:album, user: user, parent: album)

        patch :update, params: { id: album.id, album: { parent_id: child.id } }, as: :json

        expect(response).to have_http_status(:unprocessable_content)
        expect(JSON.parse(response.body).dig("errors", "parent_id"))
          .to include("cannot be the folder itself or one of its subfolders")
      end

      it "returns 422 when the new parent is the folder itself" do
        patch :update, params: { id: album.id, album: { parent_id: album.id } }, as: :json

        expect(response).to have_http_status(:unprocessable_content)
      end

      # The cycle check reads the tree and then writes it, so it has to be serialised
      # against the same user's other moves.
      it "runs inside the tree lock" do
        expect(User).to receive(:lock).and_call_original

        patch :update, params: { id: album.id, album: { parent_id: destination.id } }, as: :json
      end
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

    # Deliberately not locked: Images::AlbumDestroy calls S3, and holding a transaction
    # open across that round-trip is what the service's staleness check exists to avoid.
    it "takes no tree lock" do
      allow(Images::AlbumDestroy).to receive(:call).and_return(success_result)

      expect(User).not_to receive(:lock)
      delete :destroy, params: { id: album.id }, as: :json
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
