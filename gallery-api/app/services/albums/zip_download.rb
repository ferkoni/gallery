module Albums
  Result = Data.define(:success?, :s3_key, :url, :error)

  class ZipDownload
    S3_ERRORS = Images::Base::S3_ERRORS

    def self.call(**args)
      new(**args).call
    end

    def initialize(album:, user:, storage:, token:)
      @album = album
      @user = user
      @storage = storage
      @token = token
    end

    def call
      return failure("No S3 credentials on file") unless @storage

      images = Image.with_user(@user).where(album: @album)
      zip_key = stream_zip(images)
      url = @storage.presigned_get_url(
        zip_key,
        expires_in: 900,
        response_content_disposition: "attachment; filename=\"#{zip_filename}\""
      )

      success(s3_key: zip_key, url: url)
    rescue *S3_ERRORS => e
      failure("S3 error: #{e.message}")
    end

    private

    def zip_filename
      @zip_filename ||= "#{@album.name} #{Date.today.strftime('%Y-%m-%d')}.zip"
    end

    def stream_zip(images)
      # Key is derived from a stable per-download token (the AsyncTask id) rather
      # than a random UUID, so a retry overwrites the same object instead of
      # orphaning a new zip in the bucket. The user-facing, date-stamped filename
      # lives in the Content-Disposition (see #call), not in the key.
      key = "downloads/#{@user.id}/#{@token}/album.zip"
      @storage.multipart_put(key, content_type: "application/zip") do |sink|
        ZipKit::Streamer.open(sink) do |zip|
          seen = Hash.new(0)
          images.each do |image|
            entry_name = unique_name(File.basename(image.s3_key), seen)
            zip.write_stored_file(entry_name) do |entry_sink|
              @storage.stream_object(image.s3_key) do |chunk|
                entry_sink << chunk
              end
            end
          end
        end
      end
      key
    end

    def unique_name(basename, seen)
      count = seen[basename]
      seen[basename] += 1
      return basename if count.zero?
      ext = File.extname(basename)
      "#{File.basename(basename, ext)} (#{count})#{ext}"
    end

    def failure(message)
      Result.new(success?: false, s3_key: nil, url: nil, error: message)
    end

    def success(s3_key:, url:)
      Result.new(success?: true, s3_key: s3_key, url: url, error: nil)
    end
  end
end
