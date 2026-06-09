module AsyncTasks
  class AlbumDownloadValidator
    Result = Data.define(:success?, :error)

    def self.call(user:, payload:)
      album = Album.with_user(user).find(payload["album_id"])
      if album.images.empty?
        Result.new(success?: false, error: "Album has no images")
      else
        Result.new(success?: true, error: nil)
      end
    end
  end
end
