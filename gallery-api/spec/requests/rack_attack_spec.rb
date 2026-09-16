require "rails_helper"

# The login throttles in config/initializers/rack_attack.rb match the login path literally. Move
# the route without changing them and login is unthrottled, with nothing else failing. These
# examples are what notice (docs: api-versioning/02, decision 5).
RSpec.describe "Login throttling", type: :request do
  let(:login_path) { "/api/v1/users/login" }
  let(:user) { create(:user) }

  # Rack::Attack counts in Rails.cache, which is :null_store in test and forgets every write, so
  # without a real store nothing is ever throttled here.
  around do |example|
    original = Rack::Attack.cache.store
    Rack::Attack.cache.store = ActiveSupport::Cache::MemoryStore.new
    example.run
  ensure
    Rack::Attack.cache.store = original
  end

  def attempt(path: login_path, email: user.email, ip: "203.0.113.1")
    post path, params: { user: { email: email, password: "wrong" } }, as: :json,
               env: { "REMOTE_ADDR" => ip }
  end

  it "allows five attempts a minute from one IP and throttles the sixth" do
    5.times { attempt(email: "someone-#{SecureRandom.hex(4)}@example.com") }
    expect(response).to have_http_status(:unauthorized)

    attempt(email: "someone-else@example.com")
    expect(response).to have_http_status(:too_many_requests)
  end

  it "allows ten attempts a minute on one email across IPs and throttles the eleventh" do
    10.times { |i| attempt(ip: "203.0.113.#{i + 1}") }
    expect(response).to have_http_status(:unauthorized)

    attempt(ip: "198.51.100.1")
    expect(response).to have_http_status(:too_many_requests)
  end

  it "counts the email however it is cased or padded" do
    10.times { |i| attempt(ip: "203.0.113.#{i + 1}") }

    attempt(email: "  #{user.email.upcase} ", ip: "198.51.100.1")
    expect(response).to have_http_status(:too_many_requests)
  end

  # A throttle left on the old path would count requests that can no longer log anyone in, and
  # leave the real login route open.
  it "does not throttle the old unversioned login path, which no longer exists" do
    6.times { attempt(path: "/api/users/login", email: "someone-#{SecureRandom.hex(4)}@example.com") }

    expect(response).to have_http_status(:not_found)
  end

  # Keyed to login, not to every POST from the address.
  it "does not throttle other requests from an IP that is throttled on login" do
    6.times { attempt(email: "someone-#{SecureRandom.hex(4)}@example.com") }

    post "/api/v1/users", params: { user: { email: "new@example.com", password: "password123",
                                         password_confirmation: "password123" } },
                       as: :json, env: { "REMOTE_ADDR" => "203.0.113.1" }
    expect(response).to have_http_status(:ok)
  end
end
