# Generates thumbnails for the images that predate them. Run through
# `bin/rails images:backfill_thumbnails`.
#
# Synchronous, one image at a time, and no job. There is no upload here to fail, so —
# unlike Images::Upload — a failure on one image is logged, counted and skipped. The
# image keeps a nil thumb_key, the grid keeps falling back to its original, and the
# next run tries it again. Safe to re-run and safe to interrupt for the same reason
# inference:backfill is: pending work is derived from absence, so there is nothing to
# resume and nothing to clean up.
class Images::ThumbnailBackfill < Images::Base
  Summary = Data.define(:generated, :failed, :skipped)

  def initialize(out: $stdout)
    @out = out
    @generated = @failed = @skipped = 0
  end

  def call
    # Per user, because every image in a group needs the same S3 gateway, built from
    # that user's own encrypted credentials.
    Image.without_thumbnail.distinct.pluck(:user_id).each do |user_id|
      images = Image.without_thumbnail.where(user_id: user_id)
      storage = S3::Storage.for(S3Credential.find_by(user_id: user_id))

      # No credentials, no bucket for the originals to be in. Skipped, not failed:
      # there is nothing wrong with these images that a run could fix.
      if storage.nil?
        @skipped += images.count
        next
      end

      images.find_each { |image| backfill(image, storage) }
    end

    Summary.new(generated: @generated, failed: @failed, skipped: @skipped)
  end

  private

  def backfill(image, storage)
    thumbnail = Images::Thumbnail.generate(fetch_original(storage, image.s3_key))
    key = storage.put(Images::Thumbnail.key_for(image.s3_key), thumbnail, content_type: Images::Thumbnail::CONTENT_TYPE)

    # update_all rather than update!, so the row is re-read by the database: 0 means
    # it was deleted while its thumbnail was being made. Images::Destroy read s3_keys
    # before this key was saved, so nothing else will ever delete the object — this
    # has to. Conditioned on the id only, never on thumb_key being nil: the key is
    # deterministic, so a concurrent run that saved it first wrote the same object,
    # and deleting it here would leave that row pointing at nothing.
    if Image.where(id: image.id).update_all(thumb_key: key).zero?
      storage.delete_object(key)
      return
    end

    @generated += 1
    progress
  rescue Images::Thumbnail::GenerationFailed, *S3_ERRORS => e
    @failed += 1
    @out.puts "  image #{image.id}: #{e.message}"
    Rails.logger.warn("Images::ThumbnailBackfill: skipping image #{image.id}: #{e.message}")
  end

  # Buffered, like ImageEmbeddingJob#fetch_bytes: vips needs the whole image before it
  # can decode anything. Binary encoding matters — a default-encoding StringIO corrupts
  # JPEG bytes on write.
  def fetch_original(storage, key)
    buffer = StringIO.new(String.new(encoding: Encoding::BINARY))
    storage.stream_object(key) { |chunk| buffer.write(chunk) }
    buffer.rewind
    buffer
  end

  def progress
    @out.puts "  #{@generated} generated" if (@generated % 50).zero?
  end
end
