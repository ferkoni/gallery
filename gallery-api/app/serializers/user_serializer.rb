class UserSerializer
  include JSONAPI::Serializer

  attributes :id, :email

  attribute :s3_credential_configured do |user|
    user.s3_credential.present?
  end
end
