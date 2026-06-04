require "rails_helper"

RSpec.describe ApplicationCable::Connection, type: :channel do
  let(:user) { create(:user) }

  def jwt_for(user, jti: user.jti, exp: 1.day.from_now.to_i)
    payload = { sub: user.id.to_s, jti: jti, exp: exp }
    JWT.encode(payload, Rails.application.secret_key_base, "HS256")
  end

  def connect_with_token(token)
    connect "/cable", env: { "HTTP_SEC_WEBSOCKET_PROTOCOL" => "actioncable-v1-json, token.#{token}" }
  end

  it "connects and identifies the current_user with a valid token" do
    connect_with_token(jwt_for(user))
    expect(connection.current_user).to eq(user)
  end

  it "rejects a connection with no token" do
    expect { connect "/cable" }.to have_rejected_connection
  end

  it "rejects a connection with a malformed token" do
    expect { connect_with_token("not_a_jwt") }.to have_rejected_connection
  end

  it "rejects a connection with an expired token" do
    token = jwt_for(user, exp: 1.hour.ago.to_i)
    expect { connect_with_token(token) }.to have_rejected_connection
  end

  it "rejects a connection when the JTI has been rotated since the token was issued" do
    token = jwt_for(user)
    user.update!(jti: SecureRandom.uuid)
    expect { connect_with_token(token) }.to have_rejected_connection
  end
end
