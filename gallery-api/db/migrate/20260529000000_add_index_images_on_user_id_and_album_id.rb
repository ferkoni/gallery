class AddIndexImagesOnUserIdAndAlbumId < ActiveRecord::Migration[8.1]
  def change
    add_index :images, [ :user_id, :album_id ]
  end
end
