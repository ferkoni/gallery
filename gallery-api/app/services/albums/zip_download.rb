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

      # The whole subtree, with each folder's photos under its own directory.
      dirs = Albums::ZipPaths.for(@album, Albums::Tree.subtree(@album))
      images = Image.with_user(@user).where(album_id: dirs.keys).order(:album_id, :id)
      zip_key = stream_zip(dirs, images)
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

    def stream_zip(dirs, images)
      # Key is derived from a stable per-download token (the AsyncTask id) rather
      # than a random UUID, so a retry overwrites the same object instead of
      # orphaning a new zip in the bucket. The user-facing, date-stamped filename
      # lives in the Content-Disposition (see #call), not in the key.
      #
      # Nothing here deletes the zip, by design: the README's "Album downloads" section has
      # every user put a lifecycle rule on their bucket that expires downloads/ after a day,
      # well past the 15-minute link. Keep the prefix in step with that section.
      key = "downloads/#{@user.id}/#{@token}/album.zip"
      @storage.multipart_put(key, content_type: "application/zip") do |sink|
        ZipKit::Streamer.open(sink) do |zip|
          # Every subfolder is written as a directory first, so one that holds no photos
          # still appears when the zip is unpacked. chomp because add_empty_directory
          # appends the trailing slash itself, and "Madrid//" is not "Madrid/".
          dirs.each_value { |dir| zip.add_empty_directory(dirname: dir.chomp("/")) if dir.present? }

          # Duplicate filenames are resolved per directory: the same basename in two
          # folders is not renamed, because the paths already differ.
          seen = Hash.new { |h, dir| h[dir] = Hash.new(0) }
          images.each do |image|
            dir = dirs.fetch(image.album_id)
            entry_name = dir + unique_name(File.basename(image.s3_key), seen[dir])
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
