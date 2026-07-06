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

    @s3_key = @storage.upload(@file, album_id: @album_id)

    image = Image.new(title: title, album_id: @album_id, s3_key: @s3_key, user: @user)
    image.save!

    success(record: image)
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
