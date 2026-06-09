module ApplicationCable
  class Connection < ActionCable::Connection::Base
    identified_by :current_user

    def connect
      self.current_user = find_verified_user
    end

    private

    def find_verified_user
      token = extract_token
      reject_unauthorized_connection if token.blank?

      payload, = JWT.decode(token, Rails.application.secret_key_base, true, algorithms: [ "HS256" ])
      user = User.find_by(id: payload["sub"])
      reject_unauthorized_connection unless user && user.jti == payload["jti"]
      user
    rescue JWT::DecodeError
      reject_unauthorized_connection
    end

    def extract_token
      header = request.headers["Sec-WebSocket-Protocol"].to_s
      match = header.match(/\btoken\.(\S+)/)
      match&.[](1)
    end
  end
end
