# A real Authorization header for request specs, which go through Warden and devise-jwt
# rather than around them as Devise's controller-spec sign_in does. Encoded the way
# Api::UsersController#login encodes it, so it carries the claims the strategy checks.
module AuthHeaders
  def auth_headers_for(user)
    token, _payload = Warden::JWTAuth::UserEncoder.new.call(user, :user, nil)
    { "Authorization" => "Bearer #{token}" }
  end
end

RSpec.configure do |config|
  config.include AuthHeaders, type: :request
end
