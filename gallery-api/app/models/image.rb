class Image < ApplicationRecord
  include Userable

  belongs_to :album

  validates :title, presence: true
  validates :s3_key, presence: true, uniqueness: true
  validates :user, presence: true
  validates :album, presence: true
end
