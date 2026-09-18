require "rails_helper"

# There is no self-service signup: accounts are made with bin/rails users:create
# (docs: closed-signup/02, decision 1). The route is gone rather than switched off, so these
# pin that nothing answers there, with or without a token.
RSpec.describe "Signing up over HTTP", type: :request do
  let(:body) do
    { user: { email: "stranger@example.com", password: "password123", password_confirmation: "password123" } }
  end

  it "is not a route: a stranger gets 404 and no account" do
    expect {
      post "/api/v1/users", params: body, as: :json
    }.not_to change(User, :count)

    expect(response).to have_http_status(:not_found)
  end

  it "is not a route for a logged-in user either" do
    headers = auth_headers_for(create(:user))

    expect {
      post "/api/v1/users", params: body, headers: headers, as: :json
    }.not_to change(User, :count)

    expect(response).to have_http_status(:not_found)
  end

  # The 422 for a taken address was a free "does this email have an account?" lookup.
  it "no longer says whether an email has an account" do
    create(:user, email: "owner@example.com")

    post "/api/v1/users", params: { user: { email: "owner@example.com", password: "password123" } }, as: :json

    expect(response).to have_http_status(:not_found)
    expect(response.body).not_to include("taken")
  end
end
