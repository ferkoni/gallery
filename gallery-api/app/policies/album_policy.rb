class AlbumPolicy < ApplicationPolicy
  def show?    = record.user == user
  def create?  = true
  def update?  = record.user == user
  def destroy? = record.user == user
end
