class AddParentIdToAlbums < ActiveRecord::Migration[8.1]
  def change
    # NO ACTION, not RESTRICT or CASCADE: deleting a folder means deleting its subtree's
    # S3 objects too, which Images::AlbumDestroy owns and the database cannot do. NO ACTION
    # is checked at the end of the statement, so that service can delete parents and
    # children in one DELETE; a stray destroy of a folder with children fails instead of
    # orphaning objects. add_reference's default foreign key has no on_delete, which is
    # NO ACTION.
    add_reference :albums, :parent, foreign_key: { to_table: :albums }, index: false
    add_index :albums, [ :user_id, :parent_id ]
  end
end
