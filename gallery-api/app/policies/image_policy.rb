class ImagePolicy < ApplicationPolicy
  def index?   = true
  def show?    = record.user == user
  def create?  = true
  def destroy? = record.user == user
end
