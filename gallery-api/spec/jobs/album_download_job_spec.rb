require "rails_helper"

RSpec.describe AlbumDownloadJob, type: :job do
  let(:user) { create(:user) }
  let(:album) { create(:album, user: user) }
  let!(:s3_credential) { create(:s3_credential, user: user) }
  let!(:task) do
    create(:async_task, user: user, task_type: "album_download",
      payload: { "album_id" => album.id })
  end

  let(:success_result) do
    Albums::Result.new(
      success?: true,
      s3_key: "downloads/#{user.id}/uuid/#{album.name}.zip",
      url: "https://s3.example.com/zip?sig=abc",
      error: nil
    )
  end

  let(:storage) { instance_double(S3::Storage) }

  before do
    allow(S3::Storage).to receive(:for).and_return(storage)
    allow(Albums::ZipDownload).to receive(:call).and_return(success_result)
  end

  describe "success path" do
    it "transitions the task to completed" do
      described_class.new.perform(album.id, task.id)
      expect(task.reload.status).to eq("completed")
    end

    it "stores the presigned URL in result" do
      described_class.new.perform(album.id, task.id)
      expect(task.reload.result["url"]).to eq("https://s3.example.com/zip?sig=abc")
    end

    it "stores the s3_key in result" do
      described_class.new.perform(album.id, task.id)
      expect(task.reload.result["s3_key"]).to include("downloads/#{user.id}/")
    end

    it "scopes the album lookup to the task owner" do
      expect(Album).to receive(:with_user).with(user).and_call_original
      described_class.new.perform(album.id, task.id)
    end

    it "calls ZipDownload with the correct arguments" do
      expect(Albums::ZipDownload).to receive(:call).with(
        album: album,
        user: user,
        storage: storage,
        token: task.id
      )
      described_class.new.perform(album.id, task.id)
    end

    it "broadcasts completed status to the user's channel" do
      expect(ActionCable.server).to receive(:broadcast).with(
        "user_#{user.id}",
        hash_including(task_type: "album_download", task_id: task.id, status: "completed",
          album_name: album.name, url: "https://s3.example.com/zip?sig=abc")
      )
      described_class.new.perform(album.id, task.id)
    end
  end

  describe "idempotency" do
    before { task.update!(status: :completed) }

    it "does not re-run ZipDownload when the task is already completed" do
      expect(Albums::ZipDownload).not_to receive(:call)
      described_class.new.perform(album.id, task.id)
    end

    it "does not broadcast when the task is already completed" do
      expect(ActionCable.server).not_to receive(:broadcast)
      described_class.new.perform(album.id, task.id)
    end
  end

  describe "failure path" do
    let(:failure_result) do
      Albums::Result.new(success?: false, s3_key: nil, url: nil, error: "S3 error: forbidden")
    end

    before do
      allow(Albums::ZipDownload).to receive(:call).and_return(failure_result)
    end

    it "raises so ActiveJob retry_on can fire" do
      expect { described_class.new.perform(album.id, task.id) }.to raise_error("S3 error: forbidden")
    end

    it "does not update the task before raising" do
      expect { described_class.new.perform(album.id, task.id) }.to raise_error(StandardError)
      expect(task.reload.status).to eq("pending")
    end
  end

  describe "#mark_task_failed" do
    let(:error) { StandardError.new("S3 upload failed: bucket not found") }
    let(:job) { described_class.new(album.id, task.id) }

    it "transitions the task to failed with the error message" do
      job.mark_task_failed(error)

      task.reload
      expect(task.status).to eq("failed")
      expect(task.result["error"]).to eq("S3 upload failed: bucket not found")
    end

    it "broadcasts failed status to the user's channel" do
      expect(ActionCable.server).to receive(:broadcast).with(
        "user_#{user.id}",
        hash_including(task_type: "album_download", task_id: task.id, status: "failed",
          album_name: album.name)
      )
      job.mark_task_failed(error)
    end

    it "does nothing when the task no longer exists" do
      task.destroy
      expect { job.mark_task_failed(error) }.not_to raise_error
    end
  end
end
