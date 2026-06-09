class CreateImages < ActiveRecord::Migration[8.1]
  def change
    create_table :images do |t|
      t.string :title, null: false
      t.string :s3_key, null: false
      t.bigint :album_id, null: false
      t.bigint :user_id, null: false
      t.timestamps
    end

    add_index :images, :album_id
    add_index :images, :user_id
    add_index :images, :s3_key, unique: true
    add_foreign_key :images, :albums
    add_foreign_key :images, :users
  end
end
