require "rails_helper"

RSpec.describe AlbumDownloadJob, type: :job do
  before { allow_any_instance_of(S3Credential).to receive(:reachable?).and_return(true) }

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

  before do
    allow(Albums::ZipDownload).to receive(:call).and_return(success_result)
  end

  describe "success path" do
    it "transitions the task to ready" do
      described_class.new.perform(task.id)
      expect(task.reload.status).to eq("ready")
    end

    it "stores the presigned URL in result" do
      described_class.new.perform(task.id)
      expect(task.reload.result["url"]).to eq("https://s3.example.com/zip?sig=abc")
    end

    it "stores the s3_key in result" do
      described_class.new.perform(task.id)
      expect(task.reload.result["s3_key"]).to include("downloads/#{user.id}/")
    end

    it "scopes the album lookup to the task owner" do
      expect(Album).to receive(:with_user).with(user).and_call_original
      described_class.new.perform(task.id)
    end

    it "calls ZipDownload with the correct arguments" do
      expect(Albums::ZipDownload).to receive(:call).with(
        album: album,
        user: user,
        credential: s3_credential
      )
      described_class.new.perform(task.id)
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
      expect { described_class.new.perform(task.id) }.to raise_error("S3 error: forbidden")
    end

    it "does not update the task before raising" do
      expect { described_class.new.perform(task.id) }.to raise_error(StandardError)
      expect(task.reload.status).to eq("pending")
    end
  end

  describe "#mark_task_failed" do
    it "transitions the task to failed with the error message" do
      job = described_class.new(task.id)
      error = StandardError.new("S3 upload failed: bucket not found")
      job.mark_task_failed(error)

      task.reload
      expect(task.status).to eq("failed")
      expect(task.result["error"]).to eq("S3 upload failed: bucket not found")
    end
  end
end
