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

  # The entry names are read back out of a real zip rather than recorded from the streamer:
  # a path is what a zip is, and "Madrid//" instead of "Madrid/" is the kind of mistake only
  # the real writer makes.
  describe "a folder with subfolders" do
    let(:zip_io) { StringIO.new.tap(&:binmode) }

    # album ─┬─ madrid ── day_two
    #        └─ lisbon (empty)
    let!(:madrid) { create(:album, user: user, name: "Madrid", parent: album) }
    let!(:day_two) { create(:album, user: user, name: "Day 2", parent: madrid) }
    let!(:lisbon) { create(:album, user: user, name: "Lisbon", parent: album) }

    before do
      allow(storage).to receive(:multipart_put) { |_key, content_type:, &block| block.call(zip_io) }
      allow(storage).to receive(:stream_object).and_yield("fake bytes")
    end

    def entry_names
      call
      zip_io.rewind
      ZipKit::FileReader.new.read_zip_structure(io: zip_io).map(&:filename)
    end

    # A unique key per photo, since s3_key is unique — the basename is what the zip entry
    # is built from, and two photos may well share one.
    def photo(album, basename)
      create(:image, user: user, album: album,
                     s3_key: "albums/#{album.id}/#{SecureRandom.uuid}/#{basename}")
    end

    it "files each photo under its own folder's directory" do
      photo(album, "root.jpg")
      photo(madrid, "madrid.jpg")
      photo(day_two, "deep.jpg")

      expect(entry_names).to include("root.jpg", "Madrid/madrid.jpg", "Madrid/Day 2/deep.jpg")
    end

    it "writes a directory for a subfolder holding no photos at all" do
      expect(entry_names).to include("Lisbon/")
    end

    it "leaves the root folder's own photos at the top, as before folders could nest" do
      photo(album, "root.jpg")

      expect(entry_names).to include("root.jpg")
    end

    it "does not reach into another user's folders" do
      trespasser = create(:album, user: create(:user), name: "Theirs")
      trespasser.update_columns(parent_id: madrid.id)

      expect(entry_names).not_to include(a_string_including("Theirs"))
    end

    describe "names that are not path segments" do
      it "neutralises a name that would climb out of the zip" do
        create(:album, user: user, name: "../../etc", parent: album)

        expect(entry_names).to include("__.._etc/")
      end

      it "replaces slashes and backslashes, which would invent directories" do
        create(:album, user: user, name: "a/b\\c", parent: album)

        expect(entry_names).to include("a_b_c/")
      end

      it "falls back to a placeholder when nothing usable is left" do
        create(:album, user: user, name: "...", parent: album)

        expect(entry_names).to include("_/")
      end
    end

    it "de-duplicates sibling folders that sanitise to the same name" do
      create(:album, user: user, name: "Madrid", parent: album)

      expect(entry_names.grep(/Madrid/)).to include("Madrid/", "Madrid (1)/")
    end

    it "leaves the same filename in two directories alone, since the paths differ" do
      photo(madrid, "photo.jpg")
      photo(day_two, "photo.jpg")

      expect(entry_names).to include("Madrid/photo.jpg", "Madrid/Day 2/photo.jpg")
    end

    it "still de-duplicates two photos with the same filename in one directory" do
      photo(madrid, "photo.jpg")
      photo(madrid, "photo.jpg")

      expect(entry_names).to include("Madrid/photo.jpg", "Madrid/photo (1).jpg")
    end
  end

  describe "a flat folder" do
    let(:zip_io) { StringIO.new.tap(&:binmode) }

    before do
      allow(storage).to receive(:multipart_put) { |_key, content_type:, &block| block.call(zip_io) }
      allow(storage).to receive(:stream_object).and_yield("fake bytes")
    end

    it "produces exactly the entries it did before folders could nest" do
      call
      zip_io.rewind
      names = ZipKit::FileReader.new.read_zip_structure(io: zip_io).map(&:filename)

      # No directories, and the same per-zip de-duplication of identical basenames.
      expect(names).to eq([ "photo.jpg", "photo (1).jpg" ])
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
