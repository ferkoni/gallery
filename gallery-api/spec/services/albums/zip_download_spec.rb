require "rails_helper"

RSpec.describe Albums::ZipDownload, type: :service do
  let(:user) { create(:user) }
  let(:album) { create(:album, user: user) }
  let(:storage) { instance_double(S3::Storage) }
  let!(:images) { create_list(:image, 2, user: user, album: album) }
  let(:presigned_url) { "https://s3.example.com/downloads/zip?sig=abc" }

  before do
    images.each do |image|
      allow(storage).to receive(:stream_object).with(image.s3_key).and_yield("fake bytes")
    end
    allow(storage).to receive(:multipart_put) do |_key, content_type:, &block|
      block.call(StringIO.new)
    end
    allow(storage).to receive(:presigned_get_url).and_return(presigned_url)
  end

  let(:token) { "task-token-123" }

  def call
    described_class.call(album: album, user: user, storage: storage, token: token)
  end

  describe "success path" do
    it "returns success?: true" do
      expect(call.success?).to be(true)
    end

    it "returns the presigned URL" do
      expect(call.url).to eq(presigned_url)
    end

    it "returns an s3_key under the downloads prefix for the user" do
      expect(call.s3_key).to match(%r{^downloads/#{user.id}/})
    end

    it "uploads a zip with the correct content type" do
      expect(storage).to receive(:multipart_put).with(
        a_string_starting_with("downloads/#{user.id}/"),
        content_type: "application/zip"
      ) { |_key, **_opts, &block| block.call(StringIO.new) }
      call
    end

    it "requests a presigned URL with Content-Disposition and 15-minute expiry" do
      expect(storage).to receive(:presigned_get_url).with(
        anything,
        expires_in: 900,
        response_content_disposition: a_string_including("attachment")
      )
      call
    end

    it "streams each image from S3 by its s3_key" do
      images.each do |image|
        expect(storage).to receive(:stream_object).with(image.s3_key).and_yield("bytes")
      end
      call
    end

    it "includes the album name in the download filename via Content-Disposition" do
      expect(storage).to receive(:presigned_get_url).with(
        anything,
        expires_in: 900,
        response_content_disposition: a_string_including(album.name)
      )
      call
    end

    it "derives a deterministic s3_key from the token so retries reuse the object" do
      expect(call.s3_key).to eq("downloads/#{user.id}/#{token}/album.zip")
    end
  end

  describe "missing credential" do
    it "returns success?: false" do
      result = described_class.call(album: album, user: user, storage: nil, token: token)
      expect(result.success?).to be(false)
    end

    it "reports the missing credential" do
      result = described_class.call(album: album, user: user, storage: nil, token: token)
      expect(result.error).to eq("No S3 credentials on file")
    end

    it "does not touch S3" do
      expect(storage).not_to receive(:stream_object)
      described_class.call(album: album, user: user, storage: nil, token: token)
    end
  end

  describe "S3 fetch failure" do
    before do
      allow(storage).to receive(:stream_object).and_raise(
        Aws::S3::Errors::ServiceError.new(nil, "forbidden")
      )
    end

    it "returns success?: false" do
      expect(call.success?).to be(false)
    end

    it "includes an S3 error message" do
      expect(call.error).to include("S3 error")
    end
  end

  describe "S3 upload failure" do
    before do
      allow(storage).to receive(:multipart_put).and_raise(
        Aws::S3::Errors::ServiceError.new(nil, "upload denied")
      )
    end

    it "returns success?: false" do
      expect(call.success?).to be(false)
    end

    it "includes an S3 error message" do
      expect(call.error).to include("S3 error")
    end
  end
end
