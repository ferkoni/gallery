Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    # Comma-separated, matching how production.rb reads the same variable for
    # Action Cable's allowed_request_origins.
    origins(*ENV.fetch("CORS_ALLOWED_ORIGINS", "http://localhost:5173").split(",").map(&:strip))

    resource "*",
      headers: :any,
      methods: [ :get, :post, :put, :patch, :delete, :options, :head ],
      credentials: true,
      expose: [ "Authorization" ]
  end
end
