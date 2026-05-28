class AlbumPolicy < ApplicationPolicy
  def index?   = true
  def show?    = record.user == user
  def create?  = record.user == user
  def update?  = record.user == user
  def destroy? = record.user == user
end
