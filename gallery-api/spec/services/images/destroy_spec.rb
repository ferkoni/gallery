require "rails_helper"

RSpec.describe Images::Destroy, type: :service do
  let(:user) { create(:user) }
  let(:album) { create(:album, user: user) }
  let!(:image) { create(:image, user: user, album: album) }
  let(:storage) { instance_double(S3::Storage) }

  def call
    described_class.call(image: image, storage: storage)
  end

  describe "success path" do
    before { allow(storage).to receive(:delete_object!) }

    it "returns success?: true" do
      expect(call.success?).to be(true)
    end

    it "destroys the image record" do
      expect { call }.to change { Image.count }.by(-1)
    end

    it "calls delete_object! with the image's s3_key" do
      expect(storage).to receive(:delete_object!).with(image.s3_key)
      call
    end
  end

  describe "missing credentials" do
    it "returns success?: false when credential is nil" do
      result = described_class.call(image: image, storage: nil)
      expect(result.success?).to be(false)
      expect(result.error).to eq("No S3 credentials on file")
    end

    it "does not destroy the DB record when credential is nil" do
      expect { described_class.call(image: image, storage: nil) }
        .not_to change { Image.count }
    end
  end

  describe "S3 failure leaves DB untouched" do
    context "when delete_object! raises Aws::S3::Errors::ServiceError" do
      before do
        allow(storage).to receive(:delete_object!).and_raise(
          Aws::S3::Errors::ServiceError.new(nil, "access denied")
        )
      end

      it "returns success?: false" do
        expect(call.success?).to be(false)
      end

      it "includes the S3 error in the message" do
        expect(call.error).to include("Could not delete image from S3")
      end

      it "does not destroy the DB record" do
        expect { call }.not_to change { Image.count }
      end
    end

    context "when delete_object! raises Seahorse::Client::NetworkingError" do
      before do
        allow(storage).to receive(:delete_object!).and_raise(
          Seahorse::Client::NetworkingError.new(RuntimeError.new("connection refused"))
        )
      end

      it "returns success?: false" do
        expect(call.success?).to be(false)
      end

      it "does not destroy the DB record" do
        expect { call }.not_to change { Image.count }
      end
    end
  end
end
