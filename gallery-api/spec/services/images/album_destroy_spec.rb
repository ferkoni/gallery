require "rails_helper"

RSpec.describe Images::AlbumDestroy, type: :service do
  let(:user) { create(:user) }
  let(:album) { create(:album, user: user) }
  let(:credential) { instance_double(S3Credential, persisted?: true) }

  def call
    described_class.call(album: album, credential: credential)
  end

  describe "success path — album with images" do
    let!(:images) { create_list(:image, 3, user: user, album: album) }

    before { allow(credential).to receive(:delete_objects!) }

    it "returns success?: true" do
      expect(call.success?).to be(true)
    end

    it "calls delete_objects! with all image s3_keys" do
      keys = images.map(&:s3_key)
      expect(credential).to receive(:delete_objects!).with(match_array(keys))
      call
    end

    it "destroys the album" do
      expect { call }.to change { Album.count }.by(-1)
    end

    it "destroys all image DB records via cascade" do
      expect { call }.to change { Image.count }.by(-3)
    end
  end

  describe "success path — album with no images" do
    it "returns success?: true without requiring credentials" do
      result = described_class.call(album: album, credential: nil)
      expect(result.success?).to be(true)
    end

    it "destroys the album" do
      nil_result = described_class.call(album: album, credential: nil)
      expect(nil_result.success?).to be(true)
      expect(Album.exists?(album.id)).to be(false)
    end

    it "does not call delete_objects!" do
      expect(credential).not_to receive(:delete_objects!)
      call
    end
  end

  describe "missing credentials with images" do
    let!(:images) { create_list(:image, 2, user: user, album: album) }

    it "returns success?: false" do
      result = described_class.call(album: album, credential: nil)
      expect(result.success?).to be(false)
      expect(result.error).to eq("No S3 credentials on file")
    end

    it "does not destroy the album" do
      expect { described_class.call(album: album, credential: nil) }
        .not_to change { Album.count }
    end

    it "does not destroy the image records" do
      expect { described_class.call(album: album, credential: nil) }
        .not_to change { Image.count }
    end
  end

  describe "S3 batch failure leaves DB untouched" do
    let!(:images) { create_list(:image, 2, user: user, album: album) }

    before do
      allow(credential).to receive(:delete_objects!).and_raise(
        Aws::S3::Errors::ServiceError.new(nil, "albums/1/uuid/photo.jpg: AccessDenied")
      )
    end

    it "returns success?: false" do
      expect(call.success?).to be(false)
    end

    it "includes the S3 error in the message" do
      expect(call.error).to include("Could not delete images from S3")
    end

    it "does not destroy the album" do
      expect { call }.not_to change { Album.count }
    end

    it "does not destroy the image records" do
      expect { call }.not_to change { Image.count }
    end
  end
end
