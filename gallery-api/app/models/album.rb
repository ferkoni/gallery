class Album < ApplicationRecord
  include Userable

  validates :user, presence: true
  validates :name, presence: true, length: { maximum: 50 }
  validates :description, presence: false, length: { maximum: 500 }
end
