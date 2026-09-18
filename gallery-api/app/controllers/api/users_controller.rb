class Api::UsersController < ApplicationController
  include BaseApi
  skip_before_action :authenticate_user!, only: [ :login ]

  def login
    user = User.includes(:s3_credential).find_by(email: params[:user][:email])
    if user&.valid_password?(params[:user][:password])
      user.update!(jti: SecureRandom.uuid)
      token, _payload = Warden::JWTAuth::UserEncoder.new.call(user, :user, nil)
      render json: { token: token, user: UserSerializer.new(user).serializable_hash }, status: :ok
    else
      render json: { errors: [ "Invalid email or password" ] }, status: :unauthorized
    end
  end

  def logout
    current_user.update!(jti: SecureRandom.uuid)
    head :no_content
  end
end
