class Images::Destroy < Images::Base
  def initialize(image:, storage:)
    @image = image
    @storage = storage
  end

  def call
    # Missing credentials → fail immediately; cannot safely delete without them.
    return failure("No S3 credentials on file") unless @storage

    # S3 first — if this raises, the DB record is untouched (natural rollback).
    @storage.delete_object!(@image.s3_key)
    @image.destroy!

    success
  rescue *S3_ERRORS => e
    failure("Could not delete image from S3: #{e.message}")
  rescue ActiveRecord::RecordNotDestroyed => e
    # S3 object was already deleted but the DB record survived. Log the key so
    # it can be cleaned up manually if needed.
    Rails.logger.error "Images::Destroy — S3 object deleted but DB destroy failed " \
                       "(s3_key: #{@image.s3_key}): #{e.message}"
    failure(e.message)
  end
end
