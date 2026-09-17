require "rails_helper"

RSpec.describe Images::Move, type: :service do
  let(:user) { create(:user) }
  let(:source) { create(:album, user: user) }
  let(:target) { create(:album, user: user) }

  def call(ids:, album: target)
    described_class.call(user: user, ids: ids, album: album)
  end

  describe "success path" do
    let!(:images) { create_list(:image, 3, user: user, album: source) }

    it "returns success?: true" do
      expect(call(ids: images.map(&:id)).success?).to be(true)
    end

    it "moves every listed photo into the folder" do
      call(ids: images.map(&:id))

      expect(images.each(&:reload).map(&:album_id)).to all(eq(target.id))
    end

    it "bumps updated_at" do
      image = images.first
      image.update_column(:updated_at, 1.day.ago)

      expect { call(ids: [ image.id ]) }.to change { image.reload.updated_at }
    end

    it "leaves photos it wasn't given where they are" do
      expect { call(ids: [ images.first.id ]) }
        .not_to change { images.last.reload.album_id }
    end

    it "counts photos already in the folder as moved" do
      already = create(:image, user: user, album: target)

      result = call(ids: [ already.id, images.first.id ])

      expect(result.success?).to be(true)
      expect(already.reload.album_id).to eq(target.id)
    end

    it "succeeds with duplicate ids, moving each photo once" do
      a, b = images.first(2)

      result = call(ids: [ a.id, a.id, b.id ])

      expect(result.success?).to be(true)
      expect([ a, b ].each(&:reload).map(&:album_id)).to all(eq(target.id))
    end

    it "accepts ids as strings, the way a JSON body can send them" do
      expect(call(ids: images.map { |i| i.id.to_s }).success?).to be(true)
    end

    it "moves exactly MAX_IDS photos" do
      ids = Array.new(described_class::MAX_IDS) { create(:image, user: user, album: source).id }

      expect(call(ids: ids).success?).to be(true)
    end
  end

  describe "all or nothing" do
    let!(:mine) { create_list(:image, 2, user: user, album: source) }

    shared_examples "moves nothing" do
      it "fails with NOT_FOUND" do
        expect(call(ids: mine.map(&:id) + [ bad_id ]).error).to eq(described_class::NOT_FOUND)
      end

      it "leaves every other photo in the call where it was" do
        call(ids: mine.map(&:id) + [ bad_id ])

        expect(mine.each(&:reload).map(&:album_id)).to all(eq(source.id))
      end
    end

    context "with another user's photo" do
      let(:bad_id) { create(:image).id }

      include_examples "moves nothing"
    end

    context "with an id that doesn't exist" do
      let(:bad_id) { Image.maximum(:id).to_i + 1 }

      include_examples "moves nothing"
    end

    context "with a non-integer id" do
      let(:bad_id) { "abc" }

      include_examples "moves nothing"
    end
  end

  describe "the size of the list" do
    let(:message) { "Choose between 1 and #{described_class::MAX_IDS} photos to move" }

    it "rejects an empty list" do
      expect(call(ids: []).error).to eq(message)
    end

    it "rejects nil" do
      expect(call(ids: nil).error).to eq(message)
    end

    it "rejects a list that isn't a list" do
      expect(call(ids: "12").error).to eq(message)
    end

    it "rejects more than MAX_IDS distinct ids" do
      ids = (1..described_class::MAX_IDS + 1).to_a

      expect(call(ids: ids).error).to eq(message)
    end

    it "counts ids after removing duplicates" do
      image = create(:image, user: user, album: source)
      ids = [ image.id ] * (described_class::MAX_IDS + 1)

      expect(call(ids: ids).success?).to be(true)
    end

    it "touches nothing when the list is rejected" do
      image = create(:image, user: user, album: source)

      expect { call(ids: []) }.not_to change { image.reload.album_id }
    end
  end

  describe "when the folder is deleted between the controller's check and the update" do
    # Only the result is asserted on: the foreign-key violation aborts the Postgres
    # transaction this example runs in, so a later query would raise
    # InFailedSqlTransaction. Making the service's transaction a savepoint for the
    # test's sake alone isn't worth it.
    it "fails with #{described_class::NOT_FOUND} rather than raising" do
      image = create(:image, user: user, album: source)
      gone = create(:album, user: user)
      Album.where(id: gone.id).delete_all

      expect(call(ids: [ image.id ], album: gone).error).to eq(described_class::NOT_FOUND)
    end
  end
end
