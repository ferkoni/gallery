require "rails_helper"

# Every API route, reached through the router. The controller specs call actions directly and
# never route a path, so without this file every route could move or vanish with the suite still
# green. The prefix is defined once, so moving the API is a one-line change here
# (docs: api-versioning/03, PR 2).
RSpec.describe "API routes", type: :request do
  let(:prefix) { "/api/v1" }

  let(:user) { create(:user) }
  let(:headers) { auth_headers_for(user) }
  let(:album) { create(:album, user: user) }
  let(:image) { create(:image, user: user, album: album) }
  let(:task) { create(:async_task, user: user) }

  # Nothing here may reach S3: the image serializer presigns URLs, and saving credentials checks
  # that the bucket is reachable.
  let(:presigner) { instance_double(Aws::S3::Presigner, presigned_url: "https://bucket.example/photo.jpg") }
  let(:storage) { instance_double(S3::Storage, presigner: presigner, bucket: "bucket", reachable?: true) }
  before { allow(S3::Storage).to receive(:for).and_return(storage) }

  let(:done) { Images::Result.new(success?: true, record: nil, error: nil) }

  def credential_params
    { s3_credential: { access_key_id: "AKIAIOSFODNN7EXAMPLE", secret_access_key: "secret",
                       region: "us-east-1", bucket: "bucket" } }
  end

  # [verb, path under the prefix, expected status]. The paths are the router's own patterns, so
  # the completeness check at the bottom can compare this list with the routes that exist.
  ROUTES = [
    [ :get,    "/albums",                 200 ],
    [ :post,   "/albums",                 200 ],
    [ :get,    "/albums/:id",             200 ],
    [ :patch,  "/albums/:id",             200 ],
    [ :put,    "/albums/:id",             200 ],
    [ :delete, "/albums/:id",             204 ],
    [ :get,    "/albums/:album_id/images", 200 ],
    [ :patch,  "/s3_credentials",         204 ],
    [ :put,    "/s3_credentials",         204 ],
    [ :delete, "/s3_credentials",         204 ],
    [ :get,    "/async_tasks",            200 ],
    [ :post,   "/async_tasks",            201 ],
    [ :get,    "/async_tasks/:id",        200 ],
    [ :get,    "/images",                 200 ],
    [ :post,   "/images",                 201 ],
    [ :get,    "/images/:id",             200 ],
    [ :patch,  "/images/:id",             200 ],
    [ :put,    "/images/:id",             200 ],
    [ :delete, "/images/:id",             204 ],
    [ :post,   "/users",                  200 ],
    [ :post,   "/users/login",            200 ],
    [ :delete, "/users/logout",           204 ]
  ].freeze

  # What each route needs to succeed: the path with its ids filled in, the request body, and any
  # service that would otherwise reach S3 or the job queue.
  def request_for(verb, pattern)
    case [ verb, pattern ]
    in [ :get, "/albums" | "/images" | "/async_tasks" ]
      [ pattern, {} ]
    in [ :post, "/albums" ]
      [ pattern, { album: { name: "Madrid" } } ]
    in [ :get | :patch | :put | :delete, "/albums/:id" ]
      allow(Images::AlbumDestroy).to receive(:call).and_return(done)
      [ "/albums/#{album.id}", { album: { name: "Renamed" } } ]
    in [ :get, "/albums/:album_id/images" ]
      [ "/albums/#{album.id}/images", {} ]
    in [ :patch | :put, "/s3_credentials" ]
      [ pattern, credential_params ]
    in [ :delete, "/s3_credentials" ]
      create(:s3_credential, user: user)
      [ pattern, {} ]
    in [ :post, "/async_tasks" ]
      image
      allow(AlbumDownloadJob).to receive(:perform_later)
      [ pattern, { async_task: { task_type: "album_download", payload: { album_id: album.id } } } ]
    in [ :get, "/async_tasks/:id" ]
      [ "/async_tasks/#{task.id}", {} ]
    in [ :post, "/images" ]
      allow(Images::Upload).to receive(:call).and_return(done.with(record: image))
      [ pattern, { image: { file: "stub", title: "Beach", album_id: album.id } } ]
    in [ :get | :patch | :put | :delete, "/images/:id" ]
      allow(Images::Destroy).to receive(:call).and_return(done)
      [ "/images/#{image.id}", { image: { title: "Renamed" } } ]
    in [ :post, "/users" ]
      [ pattern, { user: { email: "new@example.com", password: "password123", password_confirmation: "password123" } } ]
    in [ :post, "/users/login" ]
      [ pattern, { user: { email: user.email, password: "password123" } } ]
    in [ :delete, "/users/logout" ]
      [ pattern, {} ]
    end
  end

  ROUTES.each do |verb, pattern, status|
    it "#{verb.upcase} #{pattern} answers #{status}" do
      path, params = request_for(verb, pattern)
      body = verb == :get ? { params: params } : { params: params, as: :json }

      send(verb, "#{prefix}#{path}", headers: headers, **body)

      expect(response).to have_http_status(status)
    end
  end

  # Accept: application/json, not axios's default "application/json, text/plain, */*": with the
  # default, Devise answers 302 instead of 401 (docs: bugs.md, bug 7).
  it "answers 401 to a request without a token, so these specs go through authentication" do
    get "#{prefix}/albums", headers: { "Accept" => "application/json" }

    expect(response).to have_http_status(:unauthorized)
  end

  # Nothing is left behind at the unversioned paths (docs: api-versioning/02, decision 4).
  it "answers 404 at the unversioned /api, even with a valid token" do
    get "/api/albums", headers: headers.merge("Accept" => "application/json")

    expect(response).to have_http_status(:not_found)
  end

  it "returns a token from login" do
    post "#{prefix}/users/login", params: { user: { email: user.email, password: "password123" } }, as: :json

    expect(response.parsed_body["token"]).to be_present
  end

  # A route added without an example here would otherwise go untested by the router.
  it "covers every route under the prefix" do
    routed = Rails.application.routes.routes.filter_map do |route|
      path = route.path.spec.to_s.delete_suffix("(.:format)")
      next unless path.start_with?("#{prefix}/")

      [ route.verb.downcase.to_sym, path.delete_prefix(prefix) ]
    end

    expect(routed).to match_array(ROUTES.map { |verb, pattern, _| [ verb, pattern ] })
  end
end
