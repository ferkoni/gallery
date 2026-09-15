# Shown to users as a "folder". The API, the schema and this code say "album"; the
# rename was UI-only by decision (docs: nested-folders/02, decision 1).
class Album < ApplicationRecord
  include Userable

  has_many :images, dependent: :destroy

  validates :user, presence: true
  validates :name, presence: true, length: { maximum: 50 }
  validates :description, length: { maximum: 500 }, allow_blank: true
end
