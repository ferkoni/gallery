require "rails_helper"

RSpec.describe Images::Upload, type: :service do
  let(:user) { create(:user) }
  let(:album) { create(:album, user: user) }
  let(:storage) { instance_double(S3::Storage) }

  let(:file) do
    instance_double(
      ActionDispatch::Http::UploadedFile,
      original_filename: "vacation.jpg",
      content_type: "image/jpeg",
      size: 1.megabyte
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
end
