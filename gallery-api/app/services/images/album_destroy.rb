class Images::AlbumDestroy < Images::Base
  # Raised when the subtree read before the S3 delete no longer describes the subtree about
  # to be deleted. Internal: the caller sees a failure Result.
  Stale = Class.new(StandardError)

  def initialize(album:, storage:)
    @album = album
    @storage = storage
  end

  def call
    ids = Albums::Tree.subtree_ids(@album)
    # Both key columns in one query rather than loading every image for Image#s3_keys. The
    # compact drops the thumb_key of images that predate thumbnails.
    images = Image.where(album_id: ids).pluck(:id, :s3_key, :thumb_key)
    keys = images.flat_map { it[1..] }.compact

    if keys.any?
      return failure("No S3 credentials on file") unless @storage

      # Batch-delete every S3 object in the subtree. Keys come from the DB so no
      # s3:ListBucket is needed. delete_objects! slices into 1000-key batches
      # automatically and raises on any per-key error.
      @storage.delete_objects!(keys)
    end

    # One transaction, images first. The NO ACTION foreign key is checked at the end of each
    # statement, so one DELETE can remove parents and children together. Image rows go by
    # delete_all: Image has no destroy callbacks, and image_embeddings cascade in the
    # database.
    Album.transaction do
      # The subtree above was read before the S3 delete, a network round-trip ago, and
      # nothing locks it — a lock here would hold a transaction open across that round-trip.
      # If a folder or photo moved in or out since, the keys just deleted no longer describe
      # what is about to be deleted, so stop and let the caller retry against the tree as it
      # now is. Without this, a folder moved OUT is deleted anyway and a photo moved IN
      # loses its row while its objects survive, both silently.
      raise Stale unless unchanged?(ids, images.map(&:first))

      Image.where(album_id: ids).delete_all
      Album.where(id: ids).delete_all
    end

    success
  rescue Stale
    failure(STALE_MESSAGE)
  rescue *S3_ERRORS => e
    failure("Could not delete images from S3: #{e.message}")
  rescue ActiveRecord::InvalidForeignKey
    # The residue the check cannot cover: a move committed between the comparison and the
    # delete, microseconds later. Same answer to the caller.
    failure(STALE_MESSAGE)
  end

  private

  STALE_MESSAGE = "The folder changed while it was being deleted. Try again.".freeze

  def unchanged?(ids, image_ids)
    Albums::Tree.subtree_ids(@album).sort == ids.sort &&
      Image.where(album_id: ids).pluck(:id).sort == image_ids.sort
  end
end
