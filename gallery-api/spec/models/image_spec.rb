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
end
