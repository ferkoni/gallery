require "rails_helper"

RSpec.describe Api::AsyncTasksController, type: :controller do
  include ActiveJob::TestHelper

  let(:user) { create(:user) }
  let(:other_user) { create(:user) }
  let!(:album) { create(:album, user: user) }
  let!(:image) { create(:image, album: album, user: user) }

  describe "GET #index" do
    before { sign_in user }

    it "returns http ok" do
      get :index, as: :json
      expect(response).to have_http_status(:ok)
    end

    it "returns only the current user's tasks" do
      own = create_list(:async_task, 2, user: user)
      create(:async_task, user: other_user)

      get :index, as: :json

      ids = JSON.parse(response.body).dig("data").map { |t| t["id"].to_i }
      expect(ids).to match_array(own.map(&:id))
    end

    it "returns tasks ordered by created_at desc" do
      older = create(:async_task, user: user, created_at: 2.hours.ago)
      newer = create(:async_task, user: user, created_at: 1.hour.ago)

      get :index, as: :json

      ids = JSON.parse(response.body).dig("data").map { |t| t["id"].to_i }
      expect(ids).to eq([ newer.id, older.id ])
    end

    context "without a token" do
      before { sign_out user }

      it "returns http unauthorized" do
        get :index, as: :json
        expect(response).to have_http_status(:unauthorized)
      end
    end
  end

  describe "GET #show" do
    before { sign_in user }

    let!(:task) { create(:async_task, user: user) }

    it "returns http ok" do
      get :show, params: { id: task.id }, as: :json
      expect(response).to have_http_status(:ok)
    end

    it "returns the task attributes" do
      get :show, params: { id: task.id }, as: :json
      json = JSON.parse(response.body)
      expect(json.dig("data", "attributes", "task_type")).to eq("album_download")
      expect(json.dig("data", "attributes", "status")).to eq("pending")
    end

    it "returns 404 for another user's task" do
      other_task = create(:async_task, user: other_user)
      get :show, params: { id: other_task.id }, as: :json
      expect(response).to have_http_status(:not_found)
    end

    context "without a token" do
      before { sign_out user }

      it "returns http unauthorized" do
        get :show, params: { id: task.id }, as: :json
        expect(response).to have_http_status(:unauthorized)
      end
    end
  end

  describe "POST #create" do
    before { sign_in user }

    let(:valid_params) { { async_task: { task_type: "album_download", payload: { album_id: album.id } } } }

    it "returns http created" do
      post :create, params: valid_params, as: :json
      expect(response).to have_http_status(:created)
    end

    it "returns the task_id" do
      post :create, params: valid_params, as: :json
      json = JSON.parse(response.body)
      expect(json["task_id"]).to be_present
    end

    it "creates an async_task with status pending" do
      expect { post :create, params: valid_params, as: :json }
        .to change { AsyncTask.with_user(user).count }.by(1)

      expect(AsyncTask.with_user(user).last.status).to eq("pending")
    end

    it "enqueues an AlbumDownloadJob" do
      expect { post :create, params: valid_params, as: :json }
        .to have_enqueued_job(AlbumDownloadJob)
    end

    context "with an unknown task_type" do
      it "returns http unprocessable content" do
        post :create, params: { async_task: { task_type: "nonexistent", payload: { album_id: album.id } } }, as: :json
        expect(response).to have_http_status(:unprocessable_content)
      end

      it "returns an error message" do
        post :create, params: { async_task: { task_type: "nonexistent", payload: { album_id: album.id } } }, as: :json
        expect(JSON.parse(response.body)["errors"]).to eq("Unknown task_type")
      end
    end

    context "when album has no images" do
      let!(:empty_album) { create(:album, user: user) }

      it "returns http unprocessable content" do
        post :create, params: { async_task: { task_type: "album_download", payload: { album_id: empty_album.id } } }, as: :json
        expect(response).to have_http_status(:unprocessable_content)
      end

      it "returns an error message" do
        post :create, params: { async_task: { task_type: "album_download", payload: { album_id: empty_album.id } } }, as: :json
        expect(JSON.parse(response.body)["errors"]).to eq("Album has no images")
      end
    end

    context "when album belongs to another user" do
      let!(:other_album) { create(:album, user: other_user) }

      it "returns 404" do
        post :create, params: { async_task: { task_type: "album_download", payload: { album_id: other_album.id } } }, as: :json
        expect(response).to have_http_status(:not_found)
      end
    end

    context "without a token" do
      before { sign_out user }

      it "returns http unauthorized" do
        post :create, params: valid_params, as: :json
        expect(response).to have_http_status(:unauthorized)
      end
    end
  end
end
