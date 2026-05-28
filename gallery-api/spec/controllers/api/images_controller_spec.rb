require "rails_helper"

RSpec.describe Api::ImagesController, type: :controller do
  let(:user) { create(:user) }
  let(:other_user) { create(:user) }
  let(:album) { create(:album, user: user) }
  let(:presigned_url) { "https://my-bucket.s3.us-east-1.amazonaws.com/albums/1/uuid/photo.jpg?sig=abc" }
  let(:credential) { instance_double(S3Credential, persisted?: true, presigned_get_url: presigned_url) }

  before { allow_any_instance_of(User).to receive(:s3_credential).and_return(credential) }

  describe "GET #index" do
    before { sign_in user }

    it "returns http ok" do
      get :index, as: :json
      expect(response).to have_http_status(:ok)
    end

    it "returns only the current user's images" do
      own = create_list(:image, 2, user: user, album: album)
      other_album = create(:album, user: other_user)
      create(:image, user: other_user, album: other_album)

      get :index, as: :json

      ids = JSON.parse(response.body).dig("data").map { |i| i["id"].to_i }
      expect(ids).to match_array(own.map(&:id))
    end

    it "filters by album_id when provided" do
      other_album = create(:album, user: user)
      image_in = create(:image, user: user, album: album)
      create(:image, user: user, album: other_album)

      get :index, params: { album_id: album.id }, as: :json

      ids = JSON.parse(response.body).dig("data").map { |i| i["id"].to_i }
      expect(ids).to eq([ image_in.id ])
    end

    it "includes a presigned url for each image" do
      create(:image, user: user, album: album)

      get :index, as: :json

      url = JSON.parse(response.body).dig("data", 0, "attributes", "url")
      expect(url).to eq(presigned_url)
    end

    it "includes pagination meta" do
      get :index, as: :json

      meta = JSON.parse(response.body)["meta"]
      expect(meta.keys).to match_array(%w[current_page total_pages total_count per_page])
    end

    context "without a token" do
      before { sign_out user }

      it "returns http unauthorized" do
        get :index, as: :json
        expect(response).to have_http_status(:unauthorized)
      end
    end
  end

  describe "GET #index (nested: /albums/:album_id/images)" do
    before { sign_in user }

    it "returns http ok" do
      get :index, params: { album_id: album.id }, as: :json
      expect(response).to have_http_status(:ok)
    end

    it "returns only images from the requested album" do
      other_album = create(:album, user: user)
      image_in = create(:image, user: user, album: album)
      create(:image, user: user, album: other_album)

      get :index, params: { album_id: album.id }, as: :json

      ids = JSON.parse(response.body).dig("data").map { |i| i["id"].to_i }
      expect(ids).to eq([ image_in.id ])
    end

    it "includes pagination meta" do
      get :index, params: { album_id: album.id }, as: :json

      meta = JSON.parse(response.body)["meta"]
      expect(meta.keys).to match_array(%w[current_page total_pages total_count per_page])
    end

    it "returns page 2 when requested" do
      allow(Kaminari.config).to receive(:default_per_page).and_return(2)
      create_list(:image, 3, user: user, album: album)

      get :index, params: { album_id: album.id, page: 2 }, as: :json

      meta = JSON.parse(response.body)["meta"]
      expect(meta["current_page"]).to eq(2)
    end

    it "returns 404 when the album does not exist" do
      get :index, params: { album_id: 0 }, as: :json
      expect(response).to have_http_status(:not_found)
    end

    it "returns 404 when the album belongs to another user" do
      other_album = create(:album, user: other_user)
      get :index, params: { album_id: other_album.id }, as: :json
      expect(response).to have_http_status(:not_found)
    end

    context "without a token" do
      before { sign_out user }

      it "returns http unauthorized" do
        get :index, params: { album_id: album.id }, as: :json
        expect(response).to have_http_status(:unauthorized)
      end
    end
  end

  describe "GET #show" do
    before { sign_in user }

    let(:image) { create(:image, user: user, album: album) }

    it "returns http ok" do
      get :show, params: { id: image.id }, as: :json
      expect(response).to have_http_status(:ok)
    end

    it "includes a presigned url" do
      get :show, params: { id: image.id }, as: :json
      url = JSON.parse(response.body).dig("data", "attributes", "url")
      expect(url).to eq(presigned_url)
    end

    it "returns 403 for another user's image" do
      other_album = create(:album, user: other_user)
      other_image = create(:image, user: other_user, album: other_album)
      get :show, params: { id: other_image.id }, as: :json
      expect(response).to have_http_status(:forbidden)
    end

    context "without a token" do
      before { sign_out user }

      it "returns http unauthorized" do
        get :show, params: { id: image.id }, as: :json
        expect(response).to have_http_status(:unauthorized)
      end
    end
  end

  describe "POST #create" do
    before { sign_in user }

    let(:image) { create(:image, user: user, album: album) }
    let(:success_result) do
      Images::Result.new(success?: true, record: image, error: nil)
    end
    let(:failure_result) do
      Images::Result.new(success?: false, record: nil, error: "File type not allowed. Accepted: JPEG, PNG, WebP, GIF")
    end

    context "when the service succeeds" do
      before { allow(Images::Upload).to receive(:call).and_return(success_result) }

      it "returns http created" do
        post :create, params: { image: { file: "stub", title: "Beach", album_id: album.id } }, as: :json
        expect(response).to have_http_status(:created)
      end

      it "renders the image data" do
        post :create, params: { image: { file: "stub", title: "Beach", album_id: album.id } }, as: :json
        json = JSON.parse(response.body)
        expect(json.dig("data", "attributes", "title")).to eq(image.title)
      end

      it "includes a presigned url in the response" do
        post :create, params: { image: { file: "stub", title: "Beach", album_id: album.id } }, as: :json
        json = JSON.parse(response.body)
        expect(json.dig("data", "attributes", "url")).to eq(presigned_url)
      end
    end

    context "when the service fails" do
      before { allow(Images::Upload).to receive(:call).and_return(failure_result) }

      it "returns http unprocessable content" do
        post :create, params: { image: { file: "stub", title: "Beach", album_id: album.id } }, as: :json
        expect(response).to have_http_status(:unprocessable_content)
      end

      it "renders the error message" do
        post :create, params: { image: { file: "stub", title: "Beach", album_id: album.id } }, as: :json
        json = JSON.parse(response.body)
        expect(json["errors"]).to include("File type not allowed")
      end
    end

    context "without a token" do
      before { sign_out user }

      it "returns http unauthorized" do
        post :create, params: { image: { file: "stub", album_id: album.id } }, as: :json
        expect(response).to have_http_status(:unauthorized)
      end
    end
  end

  describe "PATCH #update" do
    before { sign_in user }

    let!(:image) { create(:image, user: user, album: album) }

    context "when the owner updates title only" do
      it "returns http ok" do
        patch :update, params: { id: image.id, image: { title: "New Title" } }, as: :json
        expect(response).to have_http_status(:ok)
      end

      it "reflects the new title in the response" do
        patch :update, params: { id: image.id, image: { title: "New Title" } }, as: :json
        expect(JSON.parse(response.body).dig("data", "attributes", "title")).to eq("New Title")
      end
    end

    context "when the owner updates description" do
      it "returns http ok" do
        patch :update, params: { id: image.id, image: { description: "A sunny day" } }, as: :json
        expect(response).to have_http_status(:ok)
      end

      it "reflects the new description in the response" do
        patch :update, params: { id: image.id, image: { description: "A sunny day" } }, as: :json
        expect(JSON.parse(response.body).dig("data", "attributes", "description")).to eq("A sunny day")
      end
    end

    context "when the owner updates tags" do
      it "returns http ok" do
        patch :update, params: { id: image.id, image: { tags: [ "landscape", "nature" ] } }, as: :json
        expect(response).to have_http_status(:ok)
      end

      it "returns the correct tags array in the response" do
        patch :update, params: { id: image.id, image: { tags: [ "landscape", "nature" ] } }, as: :json
        expect(JSON.parse(response.body).dig("data", "attributes", "tags")).to eq([ "landscape", "nature" ])
      end
    end

    context "when the owner moves the image to another of their own albums" do
      let(:other_album) { create(:album, user: user) }

      it "returns http ok" do
        patch :update, params: { id: image.id, image: { album_id: other_album.id } }, as: :json
        expect(response).to have_http_status(:ok)
      end

      it "reflects the new album_id in the response" do
        patch :update, params: { id: image.id, image: { album_id: other_album.id } }, as: :json
        expect(JSON.parse(response.body).dig("data", "attributes", "album_id")).to eq(other_album.id)
      end
    end

    context "when the owner attempts to move to another user's album" do
      let(:other_album) { create(:album, user: other_user) }

      it "returns http not found" do
        patch :update, params: { id: image.id, image: { album_id: other_album.id } }, as: :json
        expect(response).to have_http_status(:not_found)
      end
    end

    context "when the owner submits a tag longer than 25 characters" do
      it "returns http unprocessable content" do
        patch :update, params: { id: image.id, image: { tags: [ "a" * 26 ] } }, as: :json
        expect(response).to have_http_status(:unprocessable_content)
      end

      it "identifies the tags field in the error response" do
        patch :update, params: { id: image.id, image: { tags: [ "a" * 26 ] } }, as: :json
        expect(JSON.parse(response.body)["errors"]).to be_present
      end
    end

    context "when a non-owner attempts update" do
      before { sign_in other_user }

      it "returns http forbidden" do
        patch :update, params: { id: image.id, image: { title: "Hacked" } }, as: :json
        expect(response).to have_http_status(:forbidden)
      end
    end

    context "without a token" do
      before { sign_out user }

      it "returns http unauthorized" do
        patch :update, params: { id: image.id, image: { title: "No auth" } }, as: :json
        expect(response).to have_http_status(:unauthorized)
      end
    end
  end

  describe "DELETE #destroy" do
    before { sign_in user }

    let!(:image) { create(:image, user: user, album: album) }
    let(:success_result) { Images::Result.new(success?: true, record: nil, error: nil) }
    let(:failure_result) { Images::Result.new(success?: false, record: nil, error: "Could not delete image from S3: access denied") }

    context "when the service succeeds" do
      before { allow(Images::Destroy).to receive(:call).and_return(success_result) }

      it "returns http no content" do
        delete :destroy, params: { id: image.id }, as: :json
        expect(response).to have_http_status(:no_content)
      end
    end

    context "when the service fails" do
      before { allow(Images::Destroy).to receive(:call).and_return(failure_result) }

      it "returns http unprocessable content" do
        delete :destroy, params: { id: image.id }, as: :json
        expect(response).to have_http_status(:unprocessable_content)
      end

      it "renders the error message" do
        delete :destroy, params: { id: image.id }, as: :json
        json = JSON.parse(response.body)
        expect(json["errors"]).to include("Could not delete image from S3")
      end
    end

    context "when a non-owner attempts destroy" do
      before { sign_in other_user }

      it "returns http forbidden" do
        delete :destroy, params: { id: image.id }, as: :json
        expect(response).to have_http_status(:forbidden)
      end
    end

    context "without a token" do
      before { sign_out user }

      it "returns http unauthorized" do
        delete :destroy, params: { id: image.id }, as: :json
        expect(response).to have_http_status(:unauthorized)
      end
    end
  end
end
