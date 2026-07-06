class S3Credential < ApplicationRecord
  include Userable

  encrypts :access_key_id
  encrypts :secret_access_key

  validates :user, presence: true
  validates :access_key_id, :secret_access_key, :region, :bucket, presence: true
  validates :user_id, uniqueness: true
end
