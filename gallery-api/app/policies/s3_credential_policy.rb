class S3CredentialPolicy < ApplicationPolicy
  def update?  = record.user == user
  def destroy? = record.user == user
end
