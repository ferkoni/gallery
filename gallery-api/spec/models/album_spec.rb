require "rails_helper"

RSpec.describe Album, type: :model do
  describe "validations" do
    it { should belong_to(:user) }
    it { should validate_presence_of(:user) }
    it { should validate_presence_of(:name) }
    it { should validate_length_of(:name).is_at_most(50) }
    it { should validate_length_of(:description).is_at_most(500) }
  end

  describe "parent" do
    let(:user) { create(:user) }
    let!(:root) { create(:album, user: user) }
    let!(:child) { create(:album, user: user, parent: root) }
    let!(:grandchild) { create(:album, user: user, parent: child) }

    it "may be nothing at all, which is what a top-level folder is" do
      expect(build(:album, user: user, parent: nil)).to be_valid
    end

    it "may be another folder the same user owns" do
      expect(build(:album, user: user, parent: root)).to be_valid
    end

    it "may not be a folder belonging to somebody else" do
      stranger = create(:album, user: create(:user))
      album = build(:album, user: user, parent: stranger)

      expect(album).not_to be_valid
      expect(album.errors[:parent_id]).to include("does not belong to this user")
    end

    it "may not be the folder itself" do
      child.parent = child

      expect(child).not_to be_valid
      expect(child.errors[:parent_id]).to include("cannot be the folder itself or one of its subfolders")
    end

    it "may not be one of the folder's own descendants" do
      root.parent = grandchild

      expect(root).not_to be_valid
      expect(root.errors[:parent_id]).to include("cannot be the folder itself or one of its subfolders")
    end

    it "may be a sibling" do
      sibling = create(:album, user: user, parent: root)
      child.parent = sibling

      expect(child).to be_valid
    end

    it "may be an ancestor it is already below" do
      grandchild.parent = root

      expect(grandchild).to be_valid
    end

    it "may be cleared, which moves the folder to the top level" do
      grandchild.parent = nil

      expect(grandchild).to be_valid
    end

    # The check is the expensive one — a recursive query — so it runs only for a move.
    it "is not re-checked when nothing about the parent changed" do
      grandchild.name = "Renamed"

      expect(Albums::Tree).not_to receive(:subtree_ids)
      expect(grandchild).to be_valid
    end
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
