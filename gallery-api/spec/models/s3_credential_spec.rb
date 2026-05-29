require "rails_helper"

RSpec.describe S3Credential, type: :model do
  describe "associations" do
    it { should belong_to(:user) }
  end

  describe "validations" do
    # Stub reachability so factory saves don't make real AWS calls.
    before { allow_any_instance_of(described_class).to receive(:reachable?).and_return(true) }

    subject { create(:s3_credential) }

    it { should validate_presence_of(:user) }
    it { should validate_presence_of(:access_key_id) }
    it { should validate_presence_of(:secret_access_key) }
    it { should validate_presence_of(:region) }
    it { should validate_presence_of(:bucket) }
    it { should validate_uniqueness_of(:user_id) }

    context "when credentials are present but unreachable" do
      it "adds an error on base" do
        credential = build(:s3_credential)
        allow(credential).to receive(:reachable?).and_return(false)
        credential.valid?
        expect(credential.errors[:base]).to include(
          "Cannot reach the S3 bucket — check your credentials, region, and bucket name"
        )
      end
    end

    context "when credentials are incomplete" do
      it "does not call reachable? (guard keeps the check cheap)" do
        credential = build(:s3_credential, region: "")
        expect(credential).not_to receive(:reachable?)
        credential.valid?
      end
    end
  end

  describe "encryption" do
    before { allow_any_instance_of(described_class).to receive(:reachable?).and_return(true) }

    let(:credential) do
      create(:s3_credential, access_key_id: "AKIATEST123", secret_access_key: "supersecret")
    end

    it "stores access_key_id as ciphertext in the database" do
      raw = described_class.connection.select_one(
        "SELECT access_key_id FROM s3_credentials WHERE id = #{credential.id}"
      )
      expect(raw["access_key_id"]).not_to eq("AKIATEST123")
    end

    it "stores secret_access_key as ciphertext in the database" do
      raw = described_class.connection.select_one(
        "SELECT secret_access_key FROM s3_credentials WHERE id = #{credential.id}"
      )
      expect(raw["secret_access_key"]).not_to eq("supersecret")
    end

    it "decrypts access_key_id transparently" do
      expect(credential.reload.access_key_id).to eq("AKIATEST123")
    end

    it "decrypts secret_access_key transparently" do
      expect(credential.reload.secret_access_key).to eq("supersecret")
    end
  end

  describe "#upload" do
    let(:credential) { build(:s3_credential) }
    let(:client) { instance_double(Aws::S3::Client) }
    let(:file) do
      instance_double(
        ActionDispatch::Http::UploadedFile,
        original_filename: "photo.jpg",
        content_type: "image/jpeg"
      )
    end

    before { allow(credential).to receive(:s3_client).and_return(client) }

    it "calls put_object on the S3 client" do
      expect(client).to receive(:put_object).with(
        hash_including(bucket: credential.bucket, body: file, content_type: "image/jpeg")
      )
      credential.upload(file, album_id: 42)
    end

    it "includes the album_id in the key prefix" do
      allow(client).to receive(:put_object)
      key = credential.upload(file, album_id: 42)
      expect(key).to start_with("albums/42/")
    end

    it "returns a key that ends with the filename" do
      allow(client).to receive(:put_object)
      key = credential.upload(file, album_id: 42)
      expect(key).to end_with("/photo.jpg")
    end

    it "includes a UUID segment in the key so filenames don't collide" do
      allow(client).to receive(:put_object)
      keys = 2.times.map { credential.upload(file, album_id: 42) }
      expect(keys.uniq.length).to eq(2)
    end
  end

  describe "#delete_object" do
    let(:credential) { build(:s3_credential) }
    let(:client) { instance_double(Aws::S3::Client) }

    before { allow(credential).to receive(:s3_client).and_return(client) }

    it "calls delete_object on the S3 client with the given key" do
      expect(client).to receive(:delete_object).with(bucket: credential.bucket, key: "albums/1/uuid/photo.jpg")
      credential.delete_object("albums/1/uuid/photo.jpg")
    end

    it "swallows Aws::S3::Errors::ServiceError and logs it" do
      allow(client).to receive(:delete_object).and_raise(
        Aws::S3::Errors::ServiceError.new(nil, "something went wrong")
      )
      expect(Rails.logger).to receive(:error).with(/delete_object failed/)
      expect { credential.delete_object("albums/1/uuid/photo.jpg") }.not_to raise_error
    end

    it "swallows Seahorse::Client::NetworkingError and logs it" do
      allow(client).to receive(:delete_object).and_raise(
        Seahorse::Client::NetworkingError.new(RuntimeError.new("connection refused"))
      )
      expect(Rails.logger).to receive(:error).with(/delete_object failed/)
      expect { credential.delete_object("albums/1/uuid/photo.jpg") }.not_to raise_error
    end
  end

  describe "#delete_object!" do
    let(:credential) { build(:s3_credential) }
    let(:client) { instance_double(Aws::S3::Client) }

    before { allow(credential).to receive(:s3_client).and_return(client) }

    it "calls delete_object on the S3 client" do
      expect(client).to receive(:delete_object).with(bucket: credential.bucket, key: "albums/1/uuid/photo.jpg")
      credential.delete_object!("albums/1/uuid/photo.jpg")
    end

    it "re-raises Aws::S3::Errors::ServiceError" do
      allow(client).to receive(:delete_object).and_raise(
        Aws::S3::Errors::ServiceError.new(nil, "access denied")
      )
      expect { credential.delete_object!("albums/1/uuid/photo.jpg") }
        .to raise_error(Aws::S3::Errors::ServiceError)
    end

    it "re-raises Seahorse::Client::NetworkingError" do
      allow(client).to receive(:delete_object).and_raise(
        Seahorse::Client::NetworkingError.new(RuntimeError.new("connection refused"))
      )
      expect { credential.delete_object!("albums/1/uuid/photo.jpg") }
        .to raise_error(Seahorse::Client::NetworkingError)
    end
  end

  describe "#delete_objects!" do
    let(:credential) { build(:s3_credential) }
    let(:client) { instance_double(Aws::S3::Client) }

    before { allow(credential).to receive(:s3_client).and_return(client) }

    it "calls delete_objects with all keys in a single batch when under 1000" do
      keys = %w[albums/1/a/photo.jpg albums/1/b/photo.jpg]
      response = instance_double(Aws::S3::Types::DeleteObjectsOutput, errors: [])
      expect(client).to receive(:delete_objects).with(
        bucket: credential.bucket,
        delete: { objects: keys.map { |k| { key: k } }, quiet: true }
      ).and_return(response)
      credential.delete_objects!(keys)
    end

    it "slices into 1000-key batches" do
      keys = (1..1001).map { |n| "albums/1/#{n}/photo.jpg" }
      response = instance_double(Aws::S3::Types::DeleteObjectsOutput, errors: [])
      expect(client).to receive(:delete_objects).twice.and_return(response)
      credential.delete_objects!(keys)
    end

    it "raises Aws::S3::Errors::ServiceError when the response contains per-key errors" do
      keys = [ "albums/1/uuid/photo.jpg" ]
      err = instance_double("Aws::S3::Types::Error", key: keys.first, message: "AccessDenied")
      response = instance_double(Aws::S3::Types::DeleteObjectsOutput, errors: [ err ])
      allow(client).to receive(:delete_objects).and_return(response)
      expect { credential.delete_objects!(keys) }.to raise_error(Aws::S3::Errors::ServiceError)
    end
  end

  describe "#presigner" do
    let(:credential) { build(:s3_credential) }
    let(:client) { instance_double(Aws::S3::Client) }

    before { allow(credential).to receive(:s3_client).and_return(client) }

    it "returns an Aws::S3::Presigner" do
      expect(Aws::S3::Presigner).to receive(:new).with(client: client).and_call_original
      expect(credential.presigner).to be_a(Aws::S3::Presigner)
    end

    it "returns a new instance on each call" do
      expect(credential.presigner).not_to equal(credential.presigner)
    end
  end

  describe "#presigned_get_url" do
    let(:credential) { build(:s3_credential) }
    let(:client) { instance_double(Aws::S3::Client) }
    let(:presigner) { instance_double(Aws::S3::Presigner) }

    before do
      allow(credential).to receive(:s3_client).and_return(client)
      allow(Aws::S3::Presigner).to receive(:new).with(client: client).and_return(presigner)
      allow(presigner).to receive(:presigned_url).and_return(
        "https://my-gallery-bucket.s3.us-east-1.amazonaws.com/uploads/uuid/photo.jpg?X-Amz-Signature=abc"
      )
    end

    it "returns a string URL" do
      url = credential.presigned_get_url("uploads/uuid/photo.jpg")
      expect(url).to be_a(String)
      expect(url).to start_with("https://")
    end

    it "passes the key and expiry to the presigner" do
      expect(presigner).to receive(:presigned_url).with(
        :get_object,
        bucket: credential.bucket,
        key: "uploads/uuid/photo.jpg",
        expires_in: 3600
      )
      credential.presigned_get_url("uploads/uuid/photo.jpg")
    end
  end

  describe "#reachable?" do
    let(:credential) { build(:s3_credential) }
    let(:client) { instance_double(Aws::S3::Client) }

    before { allow(credential).to receive(:s3_client).and_return(client) }

    context "when all three calls succeed (head_bucket, put_object, delete_object)" do
      before do
        allow(client).to receive(:head_bucket)
        allow(client).to receive(:put_object)
        allow(client).to receive(:delete_object)
      end

      it { expect(credential.reachable?).to be(true) }
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
          expect(credential.reachable?).to be(false)
        end
      end
    end

    context "when head_bucket raises NetworkingError" do
      before do
        allow(client).to receive(:head_bucket).and_raise(
          Seahorse::Client::NetworkingError.new(RuntimeError.new("connection refused"))
        )
      end

      it { expect(credential.reachable?).to be(false) }
    end
  end
end
