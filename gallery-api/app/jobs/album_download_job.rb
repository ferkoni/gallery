class AlbumDownloadJob < ApplicationJob
  retry_on StandardError, attempts: 3, wait: :polynomially_longer do |job, error|
    job.mark_task_failed(error)
  end

  def perform(album_id, task_id)
    task = AsyncTask.find(task_id)
    user = task.user
    album = Album.with_user(user).find(album_id)
    credential = S3Credential.find_by(user: user)

    result = Albums::ZipDownload.call(album: album, user: user, credential: credential)

    if result.success?
      task.update!(status: :ready, result: { "url" => result.url, "s3_key" => result.s3_key })
      broadcast(user.id, task_type: task.task_type, task_id: task.id, status: "ready", album_name: album.name, url: result.url)
    else
      raise result.error
    end
  end

  def mark_task_failed(error)
    task = AsyncTask.find_by(id: task_id)
    return unless task
    task.update!(status: :failed, result: { "error" => error.message })
    broadcast(
      task.user_id,
      task_type: task.task_type,
      task_id: task.id,
      status: "failed",
      album_name: Album.find_by(id: album_id)&.name
    )
  end

  private

  def album_id = arguments[0]

  def task_id = arguments[1]

  def broadcast(user_id, payload)
    ActionCable.server.broadcast("user_#{user_id}", payload)
  end
end
