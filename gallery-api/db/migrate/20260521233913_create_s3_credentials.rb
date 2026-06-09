class CreateS3Credentials < ActiveRecord::Migration[8.1]
  def change
    create_table :s3_credentials do |t|
      t.references :user, null: false, foreign_key: true, index: { unique: true }
      t.text   :access_key_id,     null: false
      t.text   :secret_access_key, null: false
      t.string :region,            null: false
      t.string :bucket,            null: false
      t.timestamps
    end
  end
end
