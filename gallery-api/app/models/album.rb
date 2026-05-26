class Album < ApplicationRecord
  include Userable

  has_many :images, dependent: :destroy

  validates :user, presence: true
  validates :name, presence: true, length: { maximum: 50 }
  validates :description, presence: false, length: { maximum: 500 }
end
