class Images::Upload < Images::Base
  ALLOWED_TYPES = %w[image/jpeg image/png image/webp image/gif].freeze
  MAX_SIZE_BYTES = 25 * 1024 * 1024 # 25 MB

  def initialize(user:, storage:, file:, title:, album_id:)
    @user = user
    @storage = storage
    @file = file
    @title = title
    @album_id = album_id
    @written_keys = []
  end

  def call
    return failure("No S3 credentials on file") unless @storage

    # Validate before touching S3 so rejections are fast and free.
    return failure("File type not allowed. Accepted: JPEG, PNG, WebP, GIF") unless allowed_type?
    return failure("File is too large. Maximum size is 25 MB") unless allowed_size?

    # Title defaults to the filename without extension when not provided.
    # This avoids prompting the user per file during bulk uploads.
    title = @title.presence || File.basename(@file.original_filename, ".*")

    # Strip between validation and the S3 write, so the bytes at rest carry no GPS,
    # no camera serial and no embedded thumbnail. Filename and content type come
    # from the multipart object rather than from the stripped bytes, which are a
    # bare StringIO — see S3::Storage#upload.
    #
    # This protects new uploads only. Objects already in the bucket keep their
    # metadata; backfilling them rewrites the user's files and is out of scope.
    stripped = Exif::Strip.call(@file)

    # Generated before anything is written, from the stripped bytes, so a photo vips
    # cannot thumbnail costs no S3 round-trip and needs no rollback.
    #
    # A thumbnail failure fails the upload, deliberately: a photo is stored with its
    # thumbnail or not at all, so there is no new photo the grid has to fall back to
    # the full-size original for.
    thumbnail = Images::Thumbnail.generate(stripped)

    s3_key = write do
      @storage.upload(
        stripped,
        album_id: @album_id,
        filename: @file.original_filename,
        content_type: @file.content_type
      )
    end
    thumb_key = write do
      @storage.put(Images::Thumbnail.key_for(s3_key), thumbnail, content_type: Images::Thumbnail::CONTENT_TYPE)
    end

    image = Image.new(title: title, album_id: @album_id, s3_key: s3_key, thumb_key: thumb_key, user: @user)
    image.save!

    enqueue_embedding(image)

    success(record: image)
  rescue Exif::Strip::UndecodableImage, Images::Thumbnail::GenerationFailed => e
    # Declared an allowed type but the bytes are not decodable — a truncated or
    # corrupt file. Both run before the first write, so there is nothing to roll
    # back. A user error, so it reports like the other validation failures rather
    # than as a 500.
    failure("File could not be processed: #{e.message}")
  rescue ActiveRecord::RecordInvalid => e
    # Both objects are already in S3. Roll back so the bucket does not accumulate
    # files with no corresponding database record.
    roll_back
    failure(e.record.errors.full_messages.to_sentence)
  rescue *S3_ERRORS => e
    # Reached from the original's write, with nothing to undo, or from the
    # thumbnail's, with the original already in S3. roll_back deletes whatever made
    # it, so the two cases are one.
    roll_back
    failure("S3 upload failed: #{e.message}")
  end

  private

  # Records a key only once its write has returned, so roll_back never deletes a key
  # that was not written by this upload.
  def write
    yield.tap { |key| @written_keys << key }
  end

  # The swallowing delete: a rollback that fails is logged by the gateway and must not
  # replace the error the user is about to see.
  def roll_back
    @written_keys.each { |key| @storage.delete_object(key) }
  end

  # After `image.save!`, never inside a transaction with it: a worker can pick the job
  # up the instant it is enqueued, and if the row is not committed yet the job finds
  # nothing and does nothing.
  #
  # Guarded on availability so an INFERENCE_MODE=none install does not accumulate jobs
  # for work that will never happen. The guard is a question about configuration, not
  # an exception to rescue — Null answers false without raising.
  #
  # A failure here must not fail the upload: the bytes are in S3 and the row is
  # committed, so the user's photo is safe. The backfill will pick it up later, which
  # is precisely what makes that task idempotent rather than merely re-runnable.
  def enqueue_embedding(image)
    adapter = Inference.adapter
    return unless adapter.available?

    ImageEmbeddingJob.perform_later([ image.id ], model_id: adapter.model_id)
  rescue StandardError => e
    Rails.logger.error("Images::Upload: could not enqueue embedding for #{image.id}: #{e.message}")
  end

  def allowed_type?
    ALLOWED_TYPES.include?(@file.content_type)
  end

  def allowed_size?
    @file.size <= MAX_SIZE_BYTES
  end
end
