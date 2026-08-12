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

  describe ".search_by_title" do
    let(:user) { create(:user) }
    let(:album) { create(:album, user: user) }

    it "matches a partial, case-insensitive title" do
      match = create(:image, user: user, album: album, title: "Sunset Beach")
      miss = create(:image, user: user, album: album, title: "Mountain Trail")

      expect(Image.search_by_title("sunset")).to include(match)
      expect(Image.search_by_title("sunset")).not_to include(miss)
    end

    it "does not match by tag" do
      image = create(:image, user: user, album: album, title: "Photo", tags: [ "sunset" ])
      expect(Image.search_by_title("sunset")).not_to include(image)
    end
  end

  describe ".search_by_tag" do
    let(:user) { create(:user) }
    let(:album) { create(:album, user: user) }

    it "matches an exact tag" do
      match = create(:image, user: user, album: album, tags: [ "beach", "sunset" ])
      miss = create(:image, user: user, album: album, tags: [ "mountain" ])

      expect(Image.search_by_tag("beach")).to include(match)
      expect(Image.search_by_tag("beach")).not_to include(miss)
    end

    it "does not match partial tags" do
      image = create(:image, user: user, album: album, tags: [ "beaches" ])
      expect(Image.search_by_tag("beach")).not_to include(image)
    end

    it "does not match by title" do
      image = create(:image, user: user, album: album, title: "Beach Day", tags: [])
      expect(Image.search_by_tag("beach")).not_to include(image)
    end
  end

  describe ".global_search" do
    let(:user) { create(:user) }
    let(:album) { create(:album, user: user) }

    it "matches by title" do
      match = create(:image, user: user, album: album, title: "Sunset Beach", tags: [])
      miss = create(:image, user: user, album: album, title: "Mountain Trail", tags: [])

      expect(Image.global_search("sunset")).to include(match)
      expect(Image.global_search("sunset")).not_to include(miss)
    end

    it "matches by tag" do
      match = create(:image, user: user, album: album, title: "Photo", tags: [ "beach" ])
      miss = create(:image, user: user, album: album, title: "Other", tags: [ "mountain" ])

      expect(Image.global_search("beach")).to include(match)
      expect(Image.global_search("beach")).not_to include(miss)
    end

    it "returns images matching either title or tag" do
      by_title = create(:image, user: user, album: album, title: "Beach Day", tags: [])
      by_tag = create(:image, user: user, album: album, title: "Photo", tags: [ "beach" ])

      expect(Image.global_search("beach")).to include(by_title, by_tag)
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

  describe ".needing_embedding" do
    let(:user) { create(:user) }
    let(:album) { create(:album, user: user) }
    let(:active) { "clip-vit-b-32/openai/v1" }

    it "selects images with no embedding for the given model" do
      image = create(:image, user: user, album: album)

      expect(Image.needing_embedding(active)).to include(image)
    end

    it "excludes an image once it has one, without writing anything to images" do
      image = create(:image, user: user, album: album)
      expect { create(:image_embedding, image: image, model_id: active) }
        .to change { Image.needing_embedding(active).count }.by(-1)

      expect(image.reload.attributes.keys).not_to include("embedded_at", "embedding_status")
    end

    # The distinction that matters. A model-blind scope ("has no embedding at all") passes
    # every other test here and then selects nothing after a model bump: the backfill
    # enqueues zero jobs and reports success, while search — which filters on the active
    # model — returns empty for every user, with nothing raised anywhere.
    it "still selects an image embedded only under a different model" do
      image = create(:image, user: user, album: album)
      create(:image_embedding, image: image, model_id: "clip-vit-b-32/openai/v2")

      expect(Image.needing_embedding(active)).to include(image)
    end

    it "composes, so a per-user filter can chain onto it" do
      mine = create(:image, user: user, album: album)
      other_user = create(:user)
      theirs = create(:image, user: other_user, album: create(:album, user: other_user))

      scoped = Image.needing_embedding(active).where(user: user)

      expect(scoped).to include(mine)
      expect(scoped).not_to include(theirs)
    end
  end
end
