# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_06_02_000000) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "albums", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.text "description"
    t.string "name", null: false
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.index ["user_id"], name: "index_albums_on_user_id"
  end

  create_table "async_tasks", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.datetime "expires_at"
    t.jsonb "payload", default: {}, null: false
    t.jsonb "result", default: {}, null: false
    t.string "status", default: "pending", null: false
    t.string "task_type", null: false
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.index ["user_id", "created_at"], name: "index_async_tasks_on_user_id_and_created_at"
    t.index ["user_id"], name: "index_async_tasks_on_user_id"
  end

  create_table "images", force: :cascade do |t|
    t.bigint "album_id", null: false
    t.datetime "created_at", null: false
    t.text "description"
    t.boolean "favorited", default: false, null: false
    t.string "s3_key", null: false
    t.text "tags", default: [], null: false, array: true
    t.string "title", null: false
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.index ["album_id"], name: "index_images_on_album_id"
    t.index ["s3_key"], name: "index_images_on_s3_key", unique: true
    t.index ["user_id", "album_id"], name: "index_images_on_user_id_and_album_id"
    t.index ["user_id"], name: "index_images_on_user_id"
  end

  create_table "s3_credentials", force: :cascade do |t|
    t.text "access_key_id", null: false
    t.string "bucket", null: false
    t.datetime "created_at", null: false
    t.string "region", null: false
    t.text "secret_access_key", null: false
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.index ["user_id"], name: "index_s3_credentials_on_user_id", unique: true
  end

  create_table "users", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "email", default: "", null: false
    t.string "encrypted_password", default: "", null: false
    t.string "jti", null: false
    t.datetime "remember_created_at"
    t.datetime "reset_password_sent_at"
    t.string "reset_password_token"
    t.datetime "updated_at", null: false
    t.index ["email"], name: "index_users_on_email", unique: true
    t.index ["jti"], name: "index_users_on_jti", unique: true
    t.index ["reset_password_token"], name: "index_users_on_reset_password_token", unique: true
  end

  add_foreign_key "albums", "users"
  add_foreign_key "async_tasks", "users"
  add_foreign_key "images", "albums"
  add_foreign_key "images", "users"
  add_foreign_key "s3_credentials", "users"
end
