require "rails_helper"

RSpec.describe S3Credential, type: :model do
  describe "associations" do
    it { should belong_to(:user) }
  end

  describe "validations" do
    subject { create(:s3_credential) }

    it { should validate_presence_of(:user) }
    it { should validate_presence_of(:access_key_id) }
    it { should validate_presence_of(:secret_access_key) }
    it { should validate_presence_of(:region) }
    it { should validate_presence_of(:bucket) }
    it { should validate_uniqueness_of(:user_id) }
  end

  describe "encryption" do
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
end
