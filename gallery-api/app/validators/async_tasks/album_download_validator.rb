module AsyncTasks
  class AlbumDownloadValidator
    Result = Data.define(:success?, :error)

    def self.call(user:, payload:)
      album = Album.with_user(user).find(payload["album_id"])
      # The whole subtree, because that is what the zip contains: a folder holding nothing
      # but subfolders full of photos is downloadable. The message keeps "Album" — it is
      # API text, and only the UI says "folder".
      if Image.with_user(user).where(album_id: Albums::Tree.subtree_ids(album)).none?
        Result.new(success?: false, error: "Album has no images")
      else
        Result.new(success?: true, error: nil)
      end
    end
  end
end
