class Images::Upload < Images::Base
  ALLOWED_TYPES = %w[image/jpeg image/png image/webp image/gif].freeze
  MAX_SIZE_BYTES = 25 * 1024 * 1024 # 25 MB

  def initialize(user:, storage:, file:, title:, album_id:)
    @user = user
    @storage = storage
    @file = file
    @title = title
    @album_id = album_id
    @s3_key = nil
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
    @s3_key = @storage.upload(
      Exif::Strip.call(@file),
      album_id: @album_id,
      filename: @file.original_filename,
      content_type: @file.content_type
    )

    image = Image.new(title: title, album_id: @album_id, s3_key: @s3_key, user: @user)
    image.save!

    success(record: image)
  rescue Exif::Strip::UndecodableImage => e
    # Declared an allowed type but the bytes are not decodable — a truncated or
    # corrupt file. Nothing has been written to S3 yet, so there is nothing to roll
    # back. A user error, so it reports like the other validation failures rather
    # than as a 500.
    failure("File could not be processed: #{e.message}")
  rescue ActiveRecord::RecordInvalid => e
    # The file is already in S3. Roll back by deleting the object so the
    # bucket does not accumulate files with no corresponding database record.
    @storage.delete_object(@s3_key) if @s3_key
    failure(e.record.errors.full_messages.to_sentence)
  rescue *S3_ERRORS => e
    failure("S3 upload failed: #{e.message}")
  end

  private

  def allowed_type?
    ALLOWED_TYPES.include?(@file.content_type)
  end

  def allowed_size?
    @file.size <= MAX_SIZE_BYTES
  end
end
