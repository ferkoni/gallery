# Matched literally, so it must move with the login route. spec/requests/rack_attack_spec.rb
# fails if it does not (docs: api-versioning/02, decision 5).
login_path = "/api/v1/users/login"

Rack::Attack.throttle("login/ip", limit: 5, period: 60) do |req|
  req.ip if req.path == login_path && req.post?
end

Rack::Attack.throttle("login/email", limit: 10, period: 60) do |req|
  if req.path == login_path && req.post?
    body = req.body.read
    req.body.rewind
    params = JSON.parse(body) rescue {}
    params.dig("user", "email")&.downcase&.strip
  end
end
