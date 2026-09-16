require "rails_helper"

RSpec.describe Images::AlbumDestroy, type: :service do
  let(:user) { create(:user) }
  let(:album) { create(:album, user: user) }
  let(:storage) { instance_double(S3::Storage) }

  def call
    described_class.call(album: album, storage: storage)
  end

  describe "success path — album with images" do
    let!(:images) { create_list(:image, 3, user: user, album: album) }

    before { allow(storage).to receive(:delete_objects!) }

    it "returns success?: true" do
      expect(call.success?).to be(true)
    end

    it "calls delete_objects! with all image s3_keys" do
      keys = images.map(&:s3_key)
      expect(storage).to receive(:delete_objects!).with(match_array(keys))
      call
    end

    it "destroys the album" do
      expect { call }.to change { Album.count }.by(-1)
    end

    it "deletes every thumbnail too, and no nil key for images without one" do
      thumbnailed = create(:image, :with_thumbnail, user: user, album: album)
      keys = images.map(&:s3_key) + [ thumbnailed.s3_key, thumbnailed.thumb_key ]

      expect(storage).to receive(:delete_objects!).with(match_array(keys))
      call
    end

    it "destroys all image DB records via cascade" do
      expect { call }.to change { Image.count }.by(-3)
    end
  end

  describe "success path — album with no images" do
    it "returns success?: true without requiring credentials" do
      result = described_class.call(album: album, storage: nil)
      expect(result.success?).to be(true)
    end

    it "destroys the album" do
      nil_result = described_class.call(album: album, storage: nil)
      expect(nil_result.success?).to be(true)
      expect(Album.exists?(album.id)).to be(false)
    end

    it "does not call delete_objects!" do
      expect(storage).not_to receive(:delete_objects!)
      call
    end
  end

  describe "missing credentials with images" do
    let!(:images) { create_list(:image, 2, user: user, album: album) }

    it "returns success?: false" do
      result = described_class.call(album: album, storage: nil)
      expect(result.success?).to be(false)
      expect(result.error).to eq("No S3 credentials on file")
    end

    it "does not destroy the album" do
      expect { described_class.call(album: album, storage: nil) }
        .not_to change { Album.count }
    end

    it "does not destroy the image records" do
      expect { described_class.call(album: album, storage: nil) }
        .not_to change { Image.count }
    end
  end

  describe "a folder with subfolders" do
    # album ─┬─ madrid ── day_two
    #        └─ lisbon (empty)
    let!(:madrid) { create(:album, user: user, name: "Madrid", parent: album) }
    let!(:day_two) { create(:album, user: user, name: "Day 2", parent: madrid) }
    let!(:lisbon) { create(:album, user: user, name: "Lisbon", parent: album) }

    let!(:here) { create(:image, user: user, album: album) }
    let!(:deep) { create(:image, :with_thumbnail, user: user, album: day_two) }

    before { allow(storage).to receive(:delete_objects!) }

    it "deletes the S3 objects of every level, thumbnails included" do
      expect(storage).to receive(:delete_objects!)
        .with(match_array([ here.s3_key, deep.s3_key, deep.thumb_key ]))

      call
    end

    it "deletes every folder in the subtree" do
      call

      expect(Album.where(id: [ album.id, madrid.id, day_two.id, lisbon.id ])).to be_empty
    end

    it "deletes every image in the subtree" do
      call

      expect(Image.where(id: [ here.id, deep.id ])).to be_empty
    end

    it "leaves a sibling folder and its images alone" do
      sibling = create(:album, user: user)
      untouched = create(:image, user: user, album: sibling)

      call

      expect(Album.exists?(sibling.id)).to be(true)
      expect(Image.exists?(untouched.id)).to be(true)
    end

    it "leaves another user's folders alone, whatever their parent_id says" do
      trespasser = create(:album, user: create(:user))
      trespasser.update_columns(parent_id: madrid.id)

      call

      expect(Album.exists?(trespasser.id)).to be(true)
    end

    it "deletes nothing at all when S3 fails" do
      allow(storage).to receive(:delete_objects!).and_raise(
        Aws::S3::Errors::ServiceError.new(nil, "AccessDenied")
      )

      expect { call }.not_to change { [ Album.count, Image.count ] }
    end
  end

  # The subtree is read before the S3 delete, a network round-trip earlier, and nothing
  # locks it — a lock would hold a transaction open across that round-trip. So the service
  # re-reads and refuses if what it is about to delete is no longer what it read.
  describe "the tree changing mid-delete" do
    let!(:child) { create(:album, user: user, parent: album) }
    let!(:image) { create(:image, user: user, album: album) }

    before { allow(storage).to receive(:delete_objects!) }

    it "refuses when a folder moved in or out, and deletes nothing" do
      allow(Albums::Tree).to receive(:subtree_ids).and_return(
        [ album.id, child.id ], [ album.id ]
      )

      expect { call }.not_to change { [ Album.count, Image.count ] }
    end

    it "refuses when a photo moved in, and deletes nothing" do
      # Uploaded into the subtree while the S3 delete was in flight, which is exactly the
      # window the check exists for: its objects were never among the keys deleted.
      allow(storage).to receive(:delete_objects!) { create(:image, user: user, album: child) }

      expect { call }.not_to change { Album.count }
      expect(Image.where(album_id: [ album.id, child.id ]).count).to eq(2)
    end

    it "tells the caller to try again" do
      allow(Albums::Tree).to receive(:subtree_ids).and_return(
        [ album.id, child.id ], [ album.id ]
      )

      expect(call.error).to eq("The folder changed while it was being deleted. Try again.")
    end

    # A move committed between the comparison and the DELETE, microseconds later, is the
    # residue the check cannot cover. The foreign key catches it; the caller sees the same
    # answer.
    it "gives the same answer when only the foreign key catches it" do
      allow(Album).to receive(:where).and_call_original
      allow(Album).to receive(:where).with(hash_including(:id)).and_raise(
        ActiveRecord::InvalidForeignKey.new("violates foreign key constraint")
      )

      expect(call.error).to eq("The folder changed while it was being deleted. Try again.")
    end
  end

  describe "S3 batch failure leaves DB untouched" do
    let!(:images) { create_list(:image, 2, user: user, album: album) }

    before do
      allow(storage).to receive(:delete_objects!).and_raise(
        Aws::S3::Errors::ServiceError.new(nil, "images/uuid/photo.jpg: AccessDenied")
      )
    end

    it "returns success?: false" do
      expect(call.success?).to be(false)
    end

    it "includes the S3 error in the message" do
      expect(call.error).to include("Could not delete images from S3")
    end

    it "does not destroy the album" do
      expect { call }.not_to change { Album.count }
    end

    it "does not destroy the image records" do
      expect { call }.not_to change { Image.count }
    end
  end
end
