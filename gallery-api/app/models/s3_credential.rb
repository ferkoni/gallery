class S3Credential < ApplicationRecord
  # Buffers zip bytes and flushes them to S3 as multipart upload parts.
  # Each part (except the last) must be at least 5 MB — the S3 minimum.
  class MultipartWriter
    MIN_PART_SIZE = 5 * 1024 * 1024

    attr_reader :completed_parts

    def initialize(s3_client, bucket, key, upload_id)
      @s3_client = s3_client
      @bucket = bucket
      @key = key
      @upload_id = upload_id
      @buffer = +""
      @completed_parts = []
      @part_number = 1
    end

    def <<(data)
      @buffer << data
      flush_part if @buffer.bytesize >= MIN_PART_SIZE
      self
    end

    def flush
      flush_part if @buffer.bytesize > 0
    end

    private

    def flush_part
      resp = @s3_client.upload_part(
        bucket: @bucket, key: @key, upload_id: @upload_id,
        part_number: @part_number, body: @buffer
      )
      @completed_parts << { part_number: @part_number, etag: resp.etag }
      @part_number += 1
      @buffer = +""
    end
  end
  include Userable

  encrypts :access_key_id
  encrypts :secret_access_key

  validates :user, presence: true
  validates :access_key_id, :secret_access_key, :region, :bucket, presence: true
  validates :user_id, uniqueness: true
  validate :credentials_reachable, if: :credentials_present?

  # Uploads a file to S3 and returns the key it was stored under.
  #
  # `file` is an ActionDispatch::Http::UploadedFile — the object Rails builds
  # from a multipart form field. It responds to:
  #   .original_filename  → the name the user gave the file on their machine
  #   .content_type       → MIME type the browser declared (e.g. "image/jpeg")
  #   .read / .to_io      → the raw bytes
  #
  # The key is prefixed with the album id so all of an album's objects share a
  # common S3 prefix. A UUID prevents collisions between uploads of the same
  # filename to the same album. File.basename strips any path the browser may
  # include in original_filename (some older browsers sent the full local path).
  def upload(file, album_id:)
    key = "albums/#{album_id}/#{SecureRandom.uuid}/#{File.basename(file.original_filename)}"
    s3_client.put_object(
      bucket: bucket,
      key: key,
      body: file,
      content_type: file.content_type
    )
    key
  end

  # Returns a presigned GET URL valid for the given duration (default 1 hour).
  # Pass response_content_disposition: to force a download filename in browsers.
  def presigned_get_url(key, expires_in: 3600, **options)
    presigner.presigned_url(:get_object, bucket: bucket, key: key, expires_in: expires_in, **options)
  end

  # Returns a presigner bound to this credential's S3 client.
  # Callers that need to sign many URLs (e.g. a serializer over a page of
  # images) should call this once and reuse the instance rather than going
  # through presigned_get_url, which builds a new client on every call.
  def presigner
    Aws::S3::Presigner.new(client: s3_client)
  end

  # Deletes an object from S3, swallowing errors.
  # Used by Images::Upload to clean up an orphaned S3 object when the
  # subsequent DB save fails. Errors are logged but not re-raised so they
  # don't mask the original validation failure.
  def delete_object(key)
    s3_client.delete_object(bucket: bucket, key: key)
  rescue Aws::S3::Errors::ServiceError, Seahorse::Client::NetworkingError => e
    Rails.logger.error "S3Credential#delete_object failed for key #{key}: #{e.message}"
  end

  # Deletes an object from S3 and raises on failure.
  # Used by Images::Destroy — the caller needs to know if the delete
  # failed so it can abort before touching the database.
  def delete_object!(key)
    s3_client.delete_object(bucket: bucket, key: key)
  end

  # Streams an S3 object in chunks, yielding each chunk to the caller.
  # Avoids loading the entire object into memory — used by Albums::ZipDownload
  # to feed image bytes directly into a streaming zip archive.
  def stream_object(key)
    s3_client.get_object(bucket: bucket, key: key) do |chunk, _headers|
      yield chunk
    end
  end

  # Uploads data to S3 using the multipart upload API, streaming it through
  # a MultipartWriter sink yielded to the caller's block. Aborts the upload
  # automatically if the block raises so no orphaned parts accumulate in S3.
  def multipart_put(key, content_type:)
    upload = s3_client.create_multipart_upload(bucket: bucket, key: key, content_type: content_type)
    writer = MultipartWriter.new(s3_client, bucket, key, upload.upload_id)
    begin
      yield writer
      writer.flush
      s3_client.complete_multipart_upload(
        bucket: bucket, key: key, upload_id: upload.upload_id,
        multipart_upload: { parts: writer.completed_parts }
      )
    rescue => e
      s3_client.abort_multipart_upload(bucket: bucket, key: key, upload_id: upload.upload_id) rescue nil
      raise e
    end
  end

  # Batch-deletes up to 1000 keys per API call (S3 limit).
  # Used by Images::AlbumDestroy to remove all of an album's objects in as few
  # round-trips as possible. quiet: true means the response only contains
  # errors — successful deletes are not listed. Raises if any key fails.
  def delete_objects!(keys)
    keys.each_slice(1000) do |batch|
      response = s3_client.delete_objects(
        bucket: bucket,
        delete: {
          objects: batch.map { |key| { key: key } },
          quiet: true
        }
      )
      if response.errors.any?
        err = response.errors.first
        raise Aws::S3::Errors::ServiceError.new(nil, "#{err.key}: #{err.message}")
      end
    end
  end

  # Checks that the stored credentials can actually reach the bucket and write
  # to it. Called as a model validation on save so bad credentials are rejected
  # immediately rather than discovered at upload time.
  #
  # Two calls are needed because head_bucket only checks that the bucket exists
  # and is accessible — it does not verify write permission. put_object confirms
  # the IAM user has s3:PutObject on this bucket. The probe object is deleted
  # immediately after the write so it does not accumulate in the bucket.
  def reachable?
    client = s3_client
    probe_key = "probe/connectivity-check-#{SecureRandom.uuid}"
    client.head_bucket(bucket: bucket)
    client.put_object(bucket: bucket, key: probe_key, body: "ok")
    client.delete_object(bucket: bucket, key: probe_key)
    true
  rescue Aws::S3::Errors::NoSuchBucket,
         Aws::S3::Errors::Forbidden,
         Aws::S3::Errors::AccessDenied,
         Aws::S3::Errors::ServiceError,
         Aws::Errors::MissingCredentialsError,
         Aws::Errors::NoSuchEndpointError,
         Seahorse::Client::NetworkingError => e
    Rails.logger.warn "S3Credential#reachable? failed: #{e.class}: #{e.message}"
    false
  end

  private

  # Builds an S3 client scoped to this user's credentials.
  # A new client is built each time rather than cached — credentials are
  # decrypted on access, so caching the client would hold a decrypted copy
  # in memory longer than necessary.
  def s3_client
    Aws::S3::Client.new(
      region: region,
      credentials: Aws::Credentials.new(access_key_id, secret_access_key)
    )
  end

  def credentials_present?
    access_key_id.present? && secret_access_key.present? &&
      region.present? && bucket.present?
  end

  def credentials_reachable
    errors.add(:base, "Cannot reach the S3 bucket — check your credentials, region, and bucket name") unless reachable?
  end
end
