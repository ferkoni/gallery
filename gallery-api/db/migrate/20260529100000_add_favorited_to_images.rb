class AddFavoritedToImages < ActiveRecord::Migration[8.1]
  def change
    add_column :images, :favorited, :boolean, null: false, default: false
  end
end
