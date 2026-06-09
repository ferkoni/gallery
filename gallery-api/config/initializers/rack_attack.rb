Rack::Attack.throttle("login/ip", limit: 5, period: 60) do |req|
  req.ip if req.path == "/api/users/login" && req.post?
end

Rack::Attack.throttle("login/email", limit: 10, period: 60) do |req|
  if req.path == "/api/users/login" && req.post?
    body = req.body.read
    req.body.rewind
    params = JSON.parse(body) rescue {}
    params.dig("user", "email")&.downcase&.strip
  end
end
