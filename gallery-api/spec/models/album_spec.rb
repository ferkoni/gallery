require "rails_helper"

RSpec.describe Album, type: :model do
  describe "validations" do
    it { should belong_to(:user) }
    it { should validate_presence_of(:user) }
    it { should validate_presence_of(:name) }
    it { should validate_length_of(:name).is_at_most(50) }
    it { should validate_length_of(:description).is_at_most(500) }
  end

  describe ".global_search" do
    let(:user) { create(:user) }

    it "matches a case-insensitive substring of the name" do
      match = create(:album, user: user, name: "Summer Holiday")
      create(:album, user: user, name: "Winter")

      expect(Album.global_search("summer")).to contain_exactly(match)
    end

    it "treats % in the query as a literal character" do
      literal = create(:album, user: user, name: "100% cotton")
      create(:album, user: user, name: "Anything")

      expect(Album.global_search("0% c")).to contain_exactly(literal)
    end

    it "treats _ in the query as a literal character" do
      literal = create(:album, user: user, name: "raw_files")
      create(:album, user: user, name: "rawXfiles")

      expect(Album.global_search("raw_f")).to contain_exactly(literal)
    end
  end
end
