class Images::AlbumDestroy < Images::Base
  def initialize(album:, storage:)
    @album = album
    @storage = storage
  end

  def call
    keys = @album.images.pluck(:s3_key)

    if keys.any?
      return failure("No S3 credentials on file") unless @storage

      # Batch-delete all S3 objects. Keys come from the DB so no s3:ListBucket
      # is needed. delete_objects! slices into 1000-key batches automatically
      # and raises on any per-key error.
      @storage.delete_objects!(keys)
    end

    # All S3 objects removed (or album was empty). Destroy the album; the
    # dependent: :destroy cascade deletes the image DB records without
    # triggering any S3 calls (Image has no after_destroy S3 callbacks).
    @album.destroy!

    success
  rescue *S3_ERRORS => e
    failure("Could not delete images from S3: #{e.message}")
  rescue ActiveRecord::RecordNotDestroyed => e
    failure(e.message)
  end
end
