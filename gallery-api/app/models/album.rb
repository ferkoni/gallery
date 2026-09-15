# Shown to users as a "folder". The API, the schema and this code say "album"; the
# rename was UI-only by decision (docs: nested-folders/02, decision 1).
class Album < ApplicationRecord
  include Userable

  has_many :images, dependent: :destroy

  # The entry point the controller reaches through BaseApi#apply_filters, mirroring
  # Image.search_by_title. A name substring is the whole of it: there is no AI tier for
  # folders, and nothing else about a folder is worth matching on.
  def self.global_search(q)
    where("name ILIKE ?", "%#{sanitize_sql_like(q)}%")
  end

  validates :user, presence: true
  validates :name, presence: true, length: { maximum: 50 }
  validates :description, length: { maximum: 500 }, allow_blank: true
end
