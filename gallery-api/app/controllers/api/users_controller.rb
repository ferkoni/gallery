class Api::UsersController < ApplicationController
  include BaseApi
  skip_before_action :authenticate_user!, only: [ :create, :login ]

  def login
    user = User.find_by(email: params[:user][:email])
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
    render json: {}, status: :no_content
  end

  protected

  def new_resource_params
    params.require(:user).permit(:email, :password, :password_confirmation)
  end

  def model_name
    User
  end

  def serializer
    UserSerializer
  end
end
