require "rails_helper"

# The premise is the absence of a credential, so nothing here stubs s3_credential or
# S3::Storage. The blanket stub in spec/controllers/api/images_controller_spec.rb:13 is what
# hid a 500 on every read path from the whole suite (docs: photos-without-credentials/02,
# decision 7).
RSpec.describe "Images for a user with no S3 credentials", type: :request do
  let(:user) { create(:user) }
  let(:headers) { auth_headers_for(user) }
  let(:album) { create(:album, user: user) }
  let(:refusal) { { "errors" => "No S3 credentials on file" } }

  it "refuses to list an empty library, which is every account before Settings" do
    expect(user.s3_credential).to be_nil

    get "/api/v1/images", headers: headers

    expect(response).to have_http_status(:unprocessable_content)
    expect(response.parsed_body).to eq(refusal)
  end

  # Uploading needs credentials, but a library outlives their deletion from the Settings page.
  context "with photos that predate the credentials being deleted" do
    let!(:image) { create(:image, user: user, album: album) }

    # The shapes the SPA asks for, each of which raised NoMethodError.
    it "refuses the favourites filter" do
      get "/api/v1/images", params: { favorited: "true" }, headers: headers
      expect(response).to have_http_status(:unprocessable_content)
    end

    it "refuses a search" do
      get "/api/v1/images", params: { q: image.title }, headers: headers
      expect(response).to have_http_status(:unprocessable_content)
    end

    it "refuses a folder's own photos" do
      get "/api/v1/albums/#{album.id}/images", headers: headers
      expect(response).to have_http_status(:unprocessable_content)
    end

    it "refuses one photo" do
      get "/api/v1/images/#{image.id}", headers: headers
      expect(response).to have_http_status(:unprocessable_content)
      expect(response.parsed_body).to eq(refusal)
    end

    # The sharp one: the update used to succeed and then fail to render, so the title was
    # saved while the client was told the request failed.
    it "refuses a metadata edit without saving it" do
      patch "/api/v1/images/#{image.id}", params: { image: { title: "Renamed" } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(image.reload.title).not_to eq("Renamed")
    end

    # Moving never touches S3, so it is deliberately not guarded.
    it "still moves a photo to another folder" do
      other = create(:album, user: user)

      patch "/api/v1/images/move", params: { ids: [ image.id ], album_id: other.id }, headers: headers, as: :json

      expect(response).to have_http_status(:no_content)
      expect(image.reload.album_id).to eq(other.id)
    end
  end

  # The guard runs after authorization: a 422 here would confirm the photo exists.
  it "still answers 403 for someone else's photo" do
    theirs = create(:image)

    get "/api/v1/images/#{theirs.id}", headers: headers

    expect(response).to have_http_status(:forbidden)
  end
end
