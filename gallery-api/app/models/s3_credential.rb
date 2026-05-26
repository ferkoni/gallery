class S3Credential < ApplicationRecord
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
  # Used to serve images from private buckets — the URL is short-lived and
  # scoped to a single object, so no bucket-wide access is granted.
  def presigned_get_url(key, expires_in: 3600)
    signer = Aws::S3::Presigner.new(client: s3_client)
    signer.presigned_url(:get_object, bucket: bucket, key: key, expires_in: expires_in)
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
