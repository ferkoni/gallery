require "rails_helper"

RSpec.describe Images::Upload, type: :service do
  let(:user) { create(:user) }
  let(:album) { create(:album, user: user) }
  let(:storage) { instance_double(S3::Storage) }

  # A real UploadedFile over a real photo, not a double: the service strips EXIF
  # before the S3 write now, so it needs bytes it can actually decode. Using the
  # genuine multipart object also means these specs exercise the same read/rewind
  # behaviour the controller hands over in production.
  let(:file) { uploaded_file("gps_tagged.jpg", filename: "vacation.jpg") }

  def uploaded_file(fixture, filename:, type: "image/jpeg")
    ActionDispatch::Http::UploadedFile.new(
      tempfile: File.open(fixture_file(fixture), "rb"),
      filename: filename,
      type: type
    )
  end

  before do
    allow(storage).to receive(:upload).and_return("albums/#{album.id}/uuid/vacation.jpg")
  end

  def call(title: "Vacation", album_id: album.id, upload_file: file)
    described_class.call(
      user: user,
      storage: storage,
      file: upload_file,
      title: title,
      album_id: album_id
    )
  end

  describe "success path" do
    it "returns success?: true" do
      expect(call.success?).to be(true)
    end

    it "returns the saved image record" do
      result = call
      expect(result.record).to be_a(Image)
      expect(result.record).to be_persisted
    end

    it "sets the s3_key from the upload" do
      expect(call.record.s3_key).to eq("albums/#{album.id}/uuid/vacation.jpg")
    end

    it "uses the provided title" do
      expect(call(title: "My Photo").record.title).to eq("My Photo")
    end

    it "defaults title to filename without extension when title is blank" do
      expect(call(title: "").record.title).to eq("vacation")
    end

    it "defaults title to filename without extension when title is nil" do
      expect(call(title: nil).record.title).to eq("vacation")
    end
  end

  describe "validation guards (no S3 call)" do
    context "when storage is nil (no credentials on file)" do
      it "returns success?: false" do
        result = described_class.call(
          user: user, storage: nil, file: file, title: "T", album_id: album.id
        )
        expect(result.success?).to be(false)
      end

      it "reports the missing credential" do
        result = described_class.call(
          user: user, storage: nil, file: file, title: "T", album_id: album.id
        )
        expect(result.error).to eq("No S3 credentials on file")
      end
    end

    context "when the MIME type is not allowed" do
      let(:file) do
        instance_double(
          ActionDispatch::Http::UploadedFile,
          original_filename: "virus.exe",
          content_type: "application/octet-stream",
          size: 1.kilobyte
        )
      end

      it "returns success?: false" do
        expect(call.success?).to be(false)
      end

      it "reports the type error" do
        expect(call.error).to include("File type not allowed")
      end

      it "does not call upload" do
        expect(storage).not_to receive(:upload)
        call
      end
    end

    context "when the file exceeds 25 MB" do
      let(:file) do
        instance_double(
          ActionDispatch::Http::UploadedFile,
          original_filename: "huge.jpg",
          content_type: "image/jpeg",
          size: 26.megabytes
        )
      end

      it "returns success?: false" do
        expect(call.success?).to be(false)
      end

      it "reports the size error" do
        expect(call.error).to include("too large")
      end

      it "does not call upload" do
        expect(storage).not_to receive(:upload)
        call
      end
    end
  end

  # The point of the issue: what lands in the bucket, not what the service returns.
  # These assert against the bytes handed to the gateway, which is the closest a
  # spec can get to the object at rest without a live S3.
  describe "EXIF stripping" do
    def uploaded_bytes
      captured = nil
      allow(storage).to receive(:upload) do |body, **|
        captured = body.read
        "albums/1/uuid/vacation.jpg"
      end
      call
      Vips::Image.new_from_buffer(captured, "")
    end

    it "sends bytes with no GPS coordinates to S3" do
      expect(uploaded_bytes.get_fields.grep(/gps/i)).to be_empty
    end

    it "sends bytes with no camera serial or capture timestamp to S3" do
      expect(uploaded_bytes.get_fields.grep(/serial|datetime/i)).to be_empty
    end

    it "keeps the colour profile, so stored photos do not render duller" do
      expect(uploaded_bytes.get_fields).to include("icc-profile-data")
    end

    # The regression the signature change can introduce. A bare StringIO has no
    # filename and no content type, and losing them breaks downloads and inline
    # display without breaking the upload — it fails silently, in the browser,
    # long after this code ran.
    it "passes the filename and content type explicitly, since the bytes carry neither" do
      expect(storage).to receive(:upload).with(
        an_instance_of(StringIO),
        hash_including(filename: "vacation.jpg", content_type: "image/jpeg")
      ).and_return("albums/1/uuid/vacation.jpg")

      call
    end

    context "when the bytes are corrupt despite an allowed MIME type" do
      let(:file) { uploaded_file("corrupt.jpg", filename: "broken.jpg") }

      it "fails rather than raising" do
        expect(call.success?).to be(false)
        expect(call.error).to include("could not be processed")
      end

      it "never writes to S3, so there is nothing to roll back" do
        expect(storage).not_to receive(:upload)
        expect(storage).not_to receive(:delete_object)
        call
      end
    end
  end

  describe "rollback on DB failure" do
    before do
      allow(storage).to receive(:upload).and_return("albums/1/uuid/vacation.jpg")
      allow_any_instance_of(Image).to receive(:save!).and_raise(
        ActiveRecord::RecordInvalid.new(Image.new)
      )
    end

    it "calls delete_object with the uploaded key" do
      expect(storage).to receive(:delete_object).with("albums/1/uuid/vacation.jpg")
      call
    end

    it "returns success?: false" do
      allow(storage).to receive(:delete_object)
      expect(call.success?).to be(false)
    end
  end

  describe "S3 upload error" do
    before do
      allow(storage).to receive(:upload).and_raise(
        Aws::S3::Errors::ServiceError.new(nil, "access denied")
      )
    end

    it "returns success?: false" do
      expect(call.success?).to be(false)
    end

    it "includes the S3 error message" do
      expect(call.error).to include("S3 upload failed")
    end
  end

  describe "enqueueing the embedding job" do
    it "enqueues nothing when inference is off" do
      # The default for a fresh self-hosted install. Without this guard such an
      # install accumulates jobs for work that will never happen.
      allow(Inference).to receive(:adapter).and_return(Inference::Null.new)

      expect { call }.not_to have_enqueued_job(ImageEmbeddingJob)
    end

    it "enqueues the new image for the active model when inference is on" do
      adapter = Inference::Fake.new
      allow(Inference).to receive(:adapter).and_return(adapter)

      # Asserted after the call, not around it: the id being checked does not exist
      # until the upload has run, and a `.with` built beforehand would match on a nil
      # that quietly degrades the assertion to "some job was enqueued".
      result = call

      expect(ImageEmbeddingJob)
        .to have_been_enqueued
        .with([ result.record.id ], model_id: adapter.model_id)
        .on_queue("inference")
    end

    it "does not fail the upload when enqueueing raises" do
      # The bytes are in S3 and the row is committed by this point, so the user's
      # photo is safe. The backfill will pick it up later — which is exactly what
      # makes that task idempotent rather than merely re-runnable.
      allow(Inference).to receive(:adapter).and_return(Inference::Fake.new)
      allow(ImageEmbeddingJob).to receive(:perform_later).and_raise("queue is down")

      expect(call.success?).to be(true)
    end
  end
end
