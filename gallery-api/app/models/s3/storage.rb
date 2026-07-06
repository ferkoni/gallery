module S3
  # A self-contained S3 gateway: all file I/O — uploads, downloads, deletes,
  # presigning, and connectivity checks — parameterized purely by config so it
  # has no knowledge of the S3Credential model. This keeps the AWS SDK coupling
  # (and its error classes) in one place while leaving the gateway reusable and
  # testable without the database.
  class Storage
    # Construction seam: maps a credential to a gateway. Duck-typed — it reads
    # the config fields without naming the S3Credential class — so nil in yields
    # nil out, letting callers treat "no gateway" as "no credentials on file".
    def self.for(credential)
      return nil if credential.nil?
      new(
        region: credential.region,
        bucket: credential.bucket,
        access_key_id: credential.access_key_id,
        secret_access_key: credential.secret_access_key
      )
    end

    attr_reader :bucket

    def initialize(region:, bucket:, access_key_id:, secret_access_key:)
      @region = region
      @bucket = bucket
      @access_key_id = access_key_id
      @secret_access_key = secret_access_key
    end

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
        bucket: @bucket,
        key: key,
        body: file,
        content_type: file.content_type
      )
      key
    end

    # Returns a presigned GET URL valid for the given duration (default 1 hour).
    # Pass response_content_disposition: to force a download filename in browsers.
    def presigned_get_url(key, expires_in: 3600, **options)
      presigner.presigned_url(:get_object, bucket: @bucket, key: key, expires_in: expires_in, **options)
    end

    # Returns a presigner bound to this gateway's S3 client.
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
      s3_client.delete_object(bucket: @bucket, key: key)
    rescue Aws::S3::Errors::ServiceError, Seahorse::Client::NetworkingError => e
      Rails.logger.error "S3::Storage#delete_object failed for key #{key}: #{e.message}"
    end

    # Deletes an object from S3 and raises on failure.
    # Used by Images::Destroy — the caller needs to know if the delete
    # failed so it can abort before touching the database.
    def delete_object!(key)
      s3_client.delete_object(bucket: @bucket, key: key)
    end

    # Streams an S3 object in chunks, yielding each chunk to the caller.
    # Avoids loading the entire object into memory — used by Albums::ZipDownload
    # to feed image bytes directly into a streaming zip archive.
    def stream_object(key)
      s3_client.get_object(bucket: @bucket, key: key) do |chunk, _headers|
        yield chunk
      end
    end

    # Uploads data to S3 using the multipart upload API, streaming it through
    # a S3::MultipartWriter sink yielded to the caller's block. Aborts the upload
    # automatically if the block raises so no orphaned parts accumulate in S3.
    def multipart_put(key, content_type:)
      client = s3_client
      upload = client.create_multipart_upload(bucket: @bucket, key: key, content_type: content_type)
      writer = S3::MultipartWriter.new(client, @bucket, key, upload.upload_id)
      begin
        yield writer
        writer.flush
        client.complete_multipart_upload(
          bucket: @bucket, key: key, upload_id: upload.upload_id,
          multipart_upload: { parts: writer.completed_parts }
        )
      rescue => e
        client.abort_multipart_upload(bucket: @bucket, key: key, upload_id: upload.upload_id) rescue nil
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
          bucket: @bucket,
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

    # Checks that the configured credentials can actually reach the bucket and
    # write to it. Called from Api::S3CredentialsController before saving so bad
    # credentials are rejected immediately rather than discovered at upload time.
    #
    # Two calls are needed because head_bucket only checks that the bucket exists
    # and is accessible — it does not verify write permission. put_object confirms
    # the IAM user has s3:PutObject on this bucket. The probe object is deleted
    # immediately after the write so it does not accumulate in the bucket.
    def reachable?
      client = s3_client
      probe_key = "probe/connectivity-check-#{SecureRandom.uuid}"
      client.head_bucket(bucket: @bucket)
      client.put_object(bucket: @bucket, key: probe_key, body: "ok")
      client.delete_object(bucket: @bucket, key: probe_key)
      true
    rescue Aws::S3::Errors::NoSuchBucket,
           Aws::S3::Errors::Forbidden,
           Aws::S3::Errors::AccessDenied,
           Aws::S3::Errors::ServiceError,
           Aws::Errors::MissingCredentialsError,
           Aws::Errors::NoSuchEndpointError,
           Seahorse::Client::NetworkingError => e
      Rails.logger.warn "S3::Storage#reachable? failed: #{e.class}: #{e.message}"
      false
    end

    private

    # Builds an S3 client scoped to the configured keys.
    # A new client is built each time rather than cached — credentials are
    # decrypted on access, so caching the client would hold a decrypted copy
    # in memory longer than necessary.
    def s3_client
      Aws::S3::Client.new(
        region: @region,
        credentials: Aws::Credentials.new(@access_key_id, @secret_access_key)
      )
    end
  end
end
