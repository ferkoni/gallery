# The users row carries one meaning beyond the user: Api::AlbumsController#with_tree_lock
# locks it while moving a folder, so that one user's moves are serialised and two of them
# cannot each pass a cycle check against a tree the other is about to change. Nothing else
# reads that lock, and it says nothing about the columns here.
class User < ApplicationRecord
  include Devise::JWT::RevocationStrategies::JTIMatcher

  # Include default devise modules. Others available are:
  # :confirmable, :lockable, :timeoutable, :trackable and :omniauthable
  has_one :s3_credential, dependent: :destroy

  # No :registerable: accounts are made with bin/rails users:create, never by the public
  # (docs: closed-signup/02, decision 3).
  devise :database_authenticatable,
         :recoverable, :rememberable, :validatable,
         :jwt_authenticatable, jwt_revocation_strategy: self
end
