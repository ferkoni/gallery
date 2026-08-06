require "rails_helper"

RSpec.describe S3::Storage, type: :model do
  let(:bucket) { "my-gallery-bucket" }
  let(:storage) do
    described_class.new(
      region: "us-east-1",
      bucket: bucket,
      access_key_id: "AKIAIOSFODNN7EXAMPLE",
      secret_access_key: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
    )
  end
  let(:client) { instance_double(Aws::S3::Client) }

  before { allow(storage).to receive(:s3_client).and_return(client) }

  describe ".for" do
    it "returns nil when the credential is nil" do
      expect(described_class.for(nil)).to be_nil
    end

    it "builds a gateway from the credential's config" do
      credential = build(:s3_credential, region: "eu-west-1", bucket: "photos")
      built = described_class.for(credential)

      expect(built).to be_a(described_class)
      expect(built.bucket).to eq("photos")
    end
  end

  describe "#upload" do
    let(:file) do
      instance_double(
        ActionDispatch::Http::UploadedFile,
        original_filename: "photo.jpg",
        content_type: "image/jpeg"
      )
    end

    it "calls put_object on the S3 client" do
      expect(client).to receive(:put_object).with(
        hash_including(bucket: bucket, body: file, content_type: "image/jpeg")
      )
      storage.upload(file, album_id: 42)
    end

    it "includes the album_id in the key prefix" do
      allow(client).to receive(:put_object)
      key = storage.upload(file, album_id: 42)
      expect(key).to start_with("albums/42/")
    end

    it "returns a key that ends with the filename" do
      allow(client).to receive(:put_object)
      key = storage.upload(file, album_id: 42)
      expect(key).to end_with("/photo.jpg")
    end

    it "includes a UUID segment in the key so filenames don't collide" do
      allow(client).to receive(:put_object)
      keys = 2.times.map { storage.upload(file, album_id: 42) }
      expect(keys.uniq.length).to eq(2)
    end
  end

  describe "#delete_object" do
    it "calls delete_object on the S3 client with the given key" do
      expect(client).to receive(:delete_object).with(bucket: bucket, key: "albums/1/uuid/photo.jpg")
      storage.delete_object("albums/1/uuid/photo.jpg")
    end

    it "swallows Aws::S3::Errors::ServiceError and logs it" do
      allow(client).to receive(:delete_object).and_raise(
        Aws::S3::Errors::ServiceError.new(nil, "something went wrong")
      )
      expect(Rails.logger).to receive(:error).with(/delete_object failed/)
      expect { storage.delete_object("albums/1/uuid/photo.jpg") }.not_to raise_error
    end

    it "swallows Seahorse::Client::NetworkingError and logs it" do
      allow(client).to receive(:delete_object).and_raise(
        Seahorse::Client::NetworkingError.new(RuntimeError.new("connection refused"))
      )
      expect(Rails.logger).to receive(:error).with(/delete_object failed/)
      expect { storage.delete_object("albums/1/uuid/photo.jpg") }.not_to raise_error
    end
  end

  describe "#delete_object!" do
    it "calls delete_object on the S3 client" do
      expect(client).to receive(:delete_object).with(bucket: bucket, key: "albums/1/uuid/photo.jpg")
      storage.delete_object!("albums/1/uuid/photo.jpg")
    end

    it "re-raises Aws::S3::Errors::ServiceError" do
      allow(client).to receive(:delete_object).and_raise(
        Aws::S3::Errors::ServiceError.new(nil, "access denied")
      )
      expect { storage.delete_object!("albums/1/uuid/photo.jpg") }
        .to raise_error(Aws::S3::Errors::ServiceError)
    end

    it "re-raises Seahorse::Client::NetworkingError" do
      allow(client).to receive(:delete_object).and_raise(
        Seahorse::Client::NetworkingError.new(RuntimeError.new("connection refused"))
      )
      expect { storage.delete_object!("albums/1/uuid/photo.jpg") }
        .to raise_error(Seahorse::Client::NetworkingError)
    end
  end

  describe "#delete_objects!" do
    it "calls delete_objects with all keys in a single batch when under 1000" do
      keys = %w[albums/1/a/photo.jpg albums/1/b/photo.jpg]
      response = instance_double(Aws::S3::Types::DeleteObjectsOutput, errors: [])
      expect(client).to receive(:delete_objects).with(
        bucket: bucket,
        delete: { objects: keys.map { |k| { key: k } }, quiet: true }
      ).and_return(response)
      storage.delete_objects!(keys)
    end

    it "slices into 1000-key batches" do
      keys = (1..1001).map { |n| "albums/1/#{n}/photo.jpg" }
      response = instance_double(Aws::S3::Types::DeleteObjectsOutput, errors: [])
      expect(client).to receive(:delete_objects).twice.and_return(response)
      storage.delete_objects!(keys)
    end

    it "raises Aws::S3::Errors::ServiceError when the response contains per-key errors" do
      keys = [ "albums/1/uuid/photo.jpg" ]
      err = instance_double("Aws::S3::Types::Error", key: keys.first, message: "AccessDenied")
      response = instance_double(Aws::S3::Types::DeleteObjectsOutput, errors: [ err ])
      allow(client).to receive(:delete_objects).and_return(response)
      expect { storage.delete_objects!(keys) }.to raise_error(Aws::S3::Errors::ServiceError)
    end
  end

  describe "#presigner" do
    it "returns an Aws::S3::Presigner" do
      expect(Aws::S3::Presigner).to receive(:new).with(client: client).and_call_original
      expect(storage.presigner).to be_a(Aws::S3::Presigner)
    end

    it "returns a new instance on each call" do
      expect(storage.presigner).not_to equal(storage.presigner)
    end
  end

  describe "#presigned_get_url" do
    let(:presigner) { instance_double(Aws::S3::Presigner) }

    before do
      allow(Aws::S3::Presigner).to receive(:new).with(client: client).and_return(presigner)
      allow(presigner).to receive(:presigned_url).and_return(
        "https://my-gallery-bucket.s3.us-east-1.amazonaws.com/uploads/uuid/photo.jpg?X-Amz-Signature=abc"
      )
    end

    it "returns a string URL" do
      url = storage.presigned_get_url("uploads/uuid/photo.jpg")
      expect(url).to be_a(String)
      expect(url).to start_with("https://")
    end

    it "passes the key and expiry to the presigner" do
      expect(presigner).to receive(:presigned_url).with(
        :get_object,
        bucket: bucket,
        key: "uploads/uuid/photo.jpg",
        expires_in: 3600
      )
      storage.presigned_get_url("uploads/uuid/photo.jpg")
    end
  end

  describe "#reachable?" do
    context "when all three calls succeed (head_bucket, put_object, delete_object)" do
      before do
        allow(client).to receive(:head_bucket)
        allow(client).to receive(:put_object)
        allow(client).to receive(:delete_object)
      end

      it { expect(storage.reachable?).to be(true) }
    end

    {
      "NoSuchBucket" => Aws::S3::Errors::NoSuchBucket,
      "Forbidden" => Aws::S3::Errors::Forbidden,
      "AccessDenied" => Aws::S3::Errors::AccessDenied,
      "generic ServiceError" => Aws::S3::Errors::ServiceError
    }.each do |label, error_class|
      context "when head_bucket raises #{label}" do
        before { allow(client).to receive(:head_bucket).and_raise(error_class.new(nil, label)) }

        it "returns false" do
          expect(storage.reachable?).to be(false)
        end
      end
    end

    context "when head_bucket raises NetworkingError" do
      before do
        allow(client).to receive(:head_bucket).and_raise(
          Seahorse::Client::NetworkingError.new(RuntimeError.new("connection refused"))
        )
      end

      it { expect(storage.reachable?).to be(false) }
    end
  end
end
