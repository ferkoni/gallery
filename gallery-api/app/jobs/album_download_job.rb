class AlbumDownloadJob < ApplicationJob
  retry_on StandardError, attempts: 3, wait: :polynomially_longer do |job, error|
    job.mark_task_failed(error)
  end

  def perform(task_id)
    task = AsyncTask.find(task_id)
    user = task.user
    album = Album.with_user(user).find(task.payload["album_id"])
    credential = S3Credential.find_by(user: user)

    result = Albums::ZipDownload.call(album: album, user: user, credential: credential)

    if result.success?
      task.update!(status: :ready, result: { "url" => result.url, "s3_key" => result.s3_key })
    else
      raise result.error
    end
  end

  def mark_task_failed(error)
    task = AsyncTask.find_by(id: arguments.first)
    task&.update!(status: :failed, result: { "error" => error.message })
  end
end
