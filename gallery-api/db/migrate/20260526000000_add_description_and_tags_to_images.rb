class AddDescriptionAndTagsToImages < ActiveRecord::Migration[8.1]
  def change
    add_column :images, :description, :text
    add_column :images, :tags, :text, array: true, null: false, default: []
  end
end
