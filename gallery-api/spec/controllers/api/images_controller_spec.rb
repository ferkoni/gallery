require "rails_helper"

RSpec.describe Api::ImagesController, type: :controller do
  let(:user) { create(:user) }
  let(:other_user) { create(:user) }
  let(:album) { create(:album, user: user) }
  let(:presigned_url) { "https://my-bucket.s3.us-east-1.amazonaws.com/images/uuid/photo.jpg?sig=abc" }
  let(:presigner) { instance_double(Aws::S3::Presigner, presigned_url: presigned_url) }
  let(:storage) { instance_double(S3::Storage, presigner: presigner, bucket: "my-bucket") }
  let(:credential) { instance_double(S3Credential) }

  before do
    allow_any_instance_of(User).to receive(:s3_credential).and_return(credential)
    allow(S3::Storage).to receive(:for).and_return(storage)
  end

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

    # "Search in this folder", so it spans the subtree. The nested route below is "what is
    # in this folder" and does not. Both set params[:album_id]; only album_scope tells them
    # apart, which is why each has its own example — a swap would pass every other test in
    # this file.
    it "includes images filed in a subfolder" do
      subfolder = create(:album, user: user, parent: album)
      here = create(:image, user: user, album: album)
      below = create(:image, user: user, album: subfolder)

      get :index, params: { album_id: album.id }, as: :json

      ids = JSON.parse(response.body).dig("data").map { |i| i["id"].to_i }
      expect(ids).to match_array([ here.id, below.id ])
    end

    it "keeps the subtree when searching inside a folder" do
      subfolder = create(:album, user: user, parent: album)
      below = create(:image, user: user, album: subfolder, title: "Sunset over Madrid")
      create(:image, user: user, album: subfolder, title: "Something else")

      get :index, params: { album_id: album.id, q: "sunset" }, as: :json

      ids = JSON.parse(response.body).dig("data").map { |i| i["id"].to_i }
      expect(ids).to eq([ below.id ])
    end

    it "can be narrowed to the folder itself with ?album_scope=direct" do
      subfolder = create(:album, user: user, parent: album)
      here = create(:image, user: user, album: album)
      create(:image, user: user, album: subfolder)

      get :index, params: { album_id: album.id, album_scope: "direct" }, as: :json

      ids = JSON.parse(response.body).dig("data").map { |i| i["id"].to_i }
      expect(ids).to eq([ here.id ])
    end

    it "includes a presigned url for each image" do
      create(:image, user: user, album: album)

      get :index, as: :json

      url = JSON.parse(response.body).dig("data", 0, "attributes", "url")
      expect(url).to eq(presigned_url)
    end

    describe "thumbnail_url" do
      # A presigner that signs the key it is given, so the key each URL was built from
      # can be read back — the shared stub answers the same URL for any key.
      before do
        allow(presigner).to receive(:presigned_url) { |_, key:, **| "https://my-bucket.s3.amazonaws.com/#{key}?sig=abc" }
      end

      def attributes
        JSON.parse(response.body).dig("data", 0, "attributes")
      end

      it "points at the thumbnail when the image has one, while url stays the original" do
        image = create(:image, :with_thumbnail, user: user, album: album)

        get :index, as: :json

        expect(attributes["thumbnail_url"]).to include(image.thumb_key)
        expect(attributes["url"]).to include(image.s3_key)
        expect(attributes["url"]).not_to include(image.thumb_key)
      end

      it "falls back to the original for an image from before thumbnails" do
        image = create(:image, user: user, album: album)

        get :index, as: :json

        expect(attributes["thumbnail_url"]).to include(image.s3_key)
      end
    end

    it "includes pagination meta" do
      get :index, as: :json

      meta = JSON.parse(response.body)["meta"]
      expect(meta.keys).to match_array(%w[current_page total_pages total_count per_page])
    end

    it "breaks a created_at tie on id, descending" do
      same_moment = 1.day.ago
      first = create(:image, user: user, album: album, created_at: same_moment)
      second = create(:image, user: user, album: album, created_at: same_moment)

      get :index, as: :json

      ids = JSON.parse(response.body)["data"].map { |i| i["id"].to_i }
      expect(ids).to eq([ second.id, first.id ])
    end

    # Search and Favourites load page after page into one list. OFFSET over rows with no
    # total order can hand the same photo to two pages and none to another.
    it "pages over a created_at tie without repeating or skipping a photo" do
      allow(Kaminari.config).to receive(:default_per_page).and_return(2)
      same_moment = 1.day.ago
      tied = Array.new(4) { create(:image, user: user, album: album, created_at: same_moment) }

      ids = [ 1, 2 ].flat_map do |page|
        get :index, params: { page: page }, as: :json
        JSON.parse(response.body)["data"].map { |i| i["id"].to_i }
      end

      expect(ids).to eq(tied.map(&:id).reverse)
    end

    context "with q param" do
      it "returns images matching by title" do
        match = create(:image, user: user, album: album, title: "Sunset Beach")
        create(:image, user: user, album: album, title: "Mountain Trail")

        get :index, params: { q: "sunset" }, as: :json

        ids = JSON.parse(response.body)["data"].map { |i| i["id"].to_i }
        expect(ids).to match_array([ match.id ])
      end

      it "returns images matching by tag" do
        match = create(:image, user: user, album: album, tags: [ "beach" ])
        create(:image, user: user, album: album, tags: [ "mountain" ])

        get :index, params: { q: "beach" }, as: :json

        ids = JSON.parse(response.body)["data"].map { |i| i["id"].to_i }
        expect(ids).to match_array([ match.id ])
      end

      # The index orders newest first. With a query that order must give way to the
      # search ranking, or page 1 holds the newest candidates instead of the best ones.
      it "returns images in search rank order, not newest first" do
        width = ImageEmbedding.column_dimensions
        towards = ->(axis) {
          raw = Array.new(width, 0.01).tap { |v| v[axis] = 1.0 }
          norm = Math.sqrt(raw.sum { |x| x * x })
          raw.map { |x| x / norm }
        }
        model_id = "clip-vit-b-32/openai/v1"

        best = create(:image, user: user, album: album, title: "IMG_0001", created_at: 2.days.ago)
        worse = create(:image, user: user, album: album, title: "IMG_0002", created_at: Time.current)
        create(:image_embedding, image: best, model_id: model_id, embedding: towards.(0))
        create(:image_embedding, image: worse, model_id: model_id, embedding: towards.(1))

        adapter = instance_double(Inference::Local, available?: true, model_id: model_id,
                                  embed_text: Inference::Embedding.new(
                                    vector: towards.(0), model_id: model_id, dimensions: width))
        allow(Inference).to receive(:adapter).and_return(adapter)

        get :index, params: { q: "lentes" }, as: :json

        ids = JSON.parse(response.body)["data"].map { |i| i["id"].to_i }
        expect(ids).to eq([ best.id, worse.id ])
      end
    end

    context "with title param" do
      it "returns images with a matching title" do
        match = create(:image, user: user, album: album, title: "Sunset Beach")
        create(:image, user: user, album: album, title: "Mountain Trail")

        get :index, params: { title: "sunset" }, as: :json

        ids = JSON.parse(response.body)["data"].map { |i| i["id"].to_i }
        expect(ids).to match_array([ match.id ])
      end

      it "does not return images matched only by tag" do
        create(:image, user: user, album: album, title: "Photo", tags: [ "sunset" ])

        get :index, params: { title: "sunset" }, as: :json

        ids = JSON.parse(response.body)["data"].map { |i| i["id"].to_i }
        expect(ids).to be_empty
      end
    end

    context "with tag param" do
      it "returns images with a matching tag" do
        match = create(:image, user: user, album: album, tags: [ "beach" ])
        create(:image, user: user, album: album, tags: [ "mountain" ])

        get :index, params: { tag: "beach" }, as: :json

        ids = JSON.parse(response.body)["data"].map { |i| i["id"].to_i }
        expect(ids).to match_array([ match.id ])
      end

      it "does not return images matched only by title" do
        create(:image, user: user, album: album, title: "Beach Day", tags: [])

        get :index, params: { tag: "beach" }, as: :json

        ids = JSON.parse(response.body)["data"].map { |i| i["id"].to_i }
        expect(ids).to be_empty
      end
    end

    context "with from param" do
      it "returns images created on or after the given date" do
        recent = create(:image, user: user, album: album, created_at: Time.current)
        create(:image, user: user, album: album, created_at: 3.days.ago)

        get :index, params: { from: Date.yesterday.to_s }, as: :json

        ids = JSON.parse(response.body)["data"].map { |i| i["id"].to_i }
        expect(ids).to match_array([ recent.id ])
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

  describe "GET #index (nested: /albums/:album_id/images)" do
    before { sign_in user }

    # Controller specs bypass routing, so the rest of this block passes album_scope by
    # hand. This is the example that proves the route supplies it.
    it "is routed with album_scope: direct" do
      expect(Rails.application.routes.recognize_path("/api/v1/albums/1/images", method: :get))
        .to include(album_scope: "direct")
    end

    it "excludes images filed in a subfolder" do
      subfolder = create(:album, user: user, parent: album)
      here = create(:image, user: user, album: album)
      create(:image, user: user, album: subfolder)

      get :index, params: { album_id: album.id, album_scope: "direct" }, as: :json

      ids = JSON.parse(response.body).dig("data").map { |i| i["id"].to_i }
      expect(ids).to eq([ here.id ])
    end

    it "returns 404 for another user's folder" do
      stranger = create(:album, user: other_user)

      get :index, params: { album_id: stranger.id, album_scope: "direct" }, as: :json

      expect(response).to have_http_status(:not_found)
    end

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

    describe "thumbnail_url" do
      # A presigner that signs the key it is given, so the key each URL was built from
      # can be read back — the shared stub answers the same URL for any key.
      before do
        allow(presigner).to receive(:presigned_url) { |_, key:, **| "https://my-bucket.s3.amazonaws.com/#{key}?sig=abc" }
      end

      def attributes
        JSON.parse(response.body).dig("data", 0, "attributes")
      end

      it "points at the thumbnail when the image has one, while url stays the original" do
        image = create(:image, :with_thumbnail, user: user, album: album)

        get :index, as: :json

        expect(attributes["thumbnail_url"]).to include(image.thumb_key)
        expect(attributes["url"]).to include(image.s3_key)
        expect(attributes["url"]).not_to include(image.thumb_key)
      end

      it "falls back to the original for an image from before thumbnails" do
        image = create(:image, user: user, album: album)

        get :index, as: :json

        expect(attributes["thumbnail_url"]).to include(image.s3_key)
      end
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

    context "with title param" do
      it "returns only images with a matching title within the album" do
        match = create(:image, user: user, album: album, title: "Sunset Beach")
        create(:image, user: user, album: album, title: "Mountain Trail")

        get :index, params: { album_id: album.id, title: "sunset" }, as: :json

        ids = JSON.parse(response.body)["data"].map { |i| i["id"].to_i }
        expect(ids).to match_array([ match.id ])
      end
    end

    context "with tag param" do
      it "returns only images with a matching tag within the album" do
        match = create(:image, user: user, album: album, tags: [ "beach" ])
        create(:image, user: user, album: album, tags: [ "mountain" ])

        get :index, params: { album_id: album.id, tag: "beach" }, as: :json

        ids = JSON.parse(response.body)["data"].map { |i| i["id"].to_i }
        expect(ids).to match_array([ match.id ])
      end
    end

    context "with from param" do
      it "returns only images created on or after the given date within the album" do
        recent = create(:image, user: user, album: album, created_at: Time.current)
        create(:image, user: user, album: album, created_at: 3.days.ago)

        get :index, params: { album_id: album.id, from: Date.yesterday.to_s }, as: :json

        ids = JSON.parse(response.body)["data"].map { |i| i["id"].to_i }
        expect(ids).to match_array([ recent.id ])
      end
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

    # The create/update disagreement that let an image be filed into somebody else's
    # album: invisible to them, then swept away by their album deletion while the S3
    # delete ran against the wrong bucket and silently succeeded.
    context "when the album belongs to another user" do
      let(:other_album) { create(:album, user: other_user) }

      it "returns http not found, and does not confirm the album exists" do
        post :create, params: { image: { file: "stub", album_id: other_album.id } }, as: :json
        expect(response).to have_http_status(:not_found)
      end

      # The assertion that pins the ORDERING, which is the reason the guard lives in the
      # controller rather than in the service. A 404 alone passes either way; only this
      # fails if the check moves below the upload, where the bytes have already made the
      # trip to S3 and a rollback is quietly undoing them.
      it "never reaches the upload service, so no bytes are sent to S3" do
        allow(Images::Upload).to receive(:call)
        post :create, params: { image: { file: "stub", album_id: other_album.id } }, as: :json
        expect(Images::Upload).not_to have_received(:call)
      end

      it "answers the same way for an album that does not exist at all" do
        post :create, params: { image: { file: "stub", album_id: 999_999 } }, as: :json
        expect(response).to have_http_status(:not_found)
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
  describe "PATCH #move" do
    before { sign_in user }

    let(:target) { create(:album, user: user) }
    let!(:images) { create_list(:image, 2, user: user, album: album) }

    def move(ids:, album_id: target.id)
      patch :move, params: { ids: ids, album_id: album_id }, as: :json
    end

    context "when the owner moves their own photos into their own folder" do
      it "returns http no content" do
        move(ids: images.map(&:id))
        expect(response).to have_http_status(:no_content)
      end

      it "files every photo under the new folder" do
        move(ids: images.map(&:id))
        expect(images.each(&:reload).map(&:album_id)).to all(eq(target.id))
      end
    end

    context "when the target folder belongs to another user" do
      it "returns http not found" do
        move(ids: images.map(&:id), album_id: create(:album, user: other_user).id)
        expect(response).to have_http_status(:not_found)
      end

      it "moves nothing" do
        move(ids: images.map(&:id), album_id: create(:album, user: other_user).id)
        expect(images.each(&:reload).map(&:album_id)).to all(eq(album.id))
      end
    end

    context "when one of the ids is another user's photo" do
      let(:theirs) { create(:image, user: other_user) }

      it "returns http not found with the batch's message" do
        move(ids: images.map(&:id) + [ theirs.id ])
        expect(response).to have_http_status(:not_found)
        expect(JSON.parse(response.body)).to eq("errors" => "Not found")
      end

      it "moves nothing, including the photos that were the owner's" do
        move(ids: images.map(&:id) + [ theirs.id ])
        expect(images.each(&:reload).map(&:album_id)).to all(eq(album.id))
      end
    end

    context "when ids is empty" do
      it "returns http unprocessable content with the sentence" do
        move(ids: [])
        expect(response).to have_http_status(:unprocessable_content)
        expect(JSON.parse(response.body)["errors"]).to eq("Choose between 1 and 500 photos to move")
      end
    end

    context "when album_id is missing" do
      it "returns http not found" do
        patch :move, params: { ids: images.map(&:id) }, as: :json
        expect(response).to have_http_status(:not_found)
      end
    end

    context "without a token" do
      before { sign_out user }

      it "returns http unauthorized" do
        move(ids: images.map(&:id))
        expect(response).to have_http_status(:unauthorized)
      end
    end
  end
end
