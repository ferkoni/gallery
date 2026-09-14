class AddThumbKeyToImages < ActiveRecord::Migration[8.1]
  def change
    # Nullable: images uploaded before thumbnails existed have none until
    # `images:backfill_thumbnails` reaches them. Every upload from here on sets it —
    # Images::Upload refuses to save a row without one.
    add_column :images, :thumb_key, :string

    # Unique, like s3_key: two rows pointing at one thumbnail would mean deleting either
    # deletes the other's. Postgres does not count NULLs as duplicates, so the rows still
    # waiting for the backfill do not conflict with each other.
    add_index :images, :thumb_key, unique: true
  end
end
