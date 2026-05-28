require "rails_helper"

RSpec.describe Image, type: :model do
  describe "associations" do
    it { should belong_to(:user) }
    it { should belong_to(:album) }
  end

  describe "validations" do
    subject { create(:image) }

    it { should validate_presence_of(:title) }
    it { should validate_presence_of(:s3_key) }
    it { should validate_uniqueness_of(:s3_key) }
    it { should validate_presence_of(:user) }
    it { should validate_presence_of(:album) }
  end

  describe "column defaults" do
    subject(:image) { build(:image) }

    it "defaults description to nil" do
      expect(image.description).to be_nil
    end

    it "defaults tags to an empty array" do
      expect(image.tags).to eq([])
    end
  end

  describe "#tags_length" do
    it "is valid when all tags are 25 characters or fewer" do
      image = build(:image, tags: [ "landscape", "a" * 25 ])
      expect(image).to be_valid
    end

    it "is invalid when any tag exceeds 25 characters" do
      image = build(:image, tags: [ "ok", "a" * 26 ])
      expect(image).not_to be_valid
      expect(image.errors[:tags]).to be_present
    end

    it "is valid with an empty tags array" do
      image = build(:image, tags: [])
      expect(image).to be_valid
    end
  end
end
