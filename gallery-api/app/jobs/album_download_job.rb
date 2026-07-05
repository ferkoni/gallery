class AlbumDownloadJob < ApplicationJob
  retry_on StandardError, attempts: 3, wait: :polynomially_longer do |job, error|
    job.mark_task_failed(error)
  end

  def perform(album_id, task_id)
    task = AsyncTask.find(task_id)
    # Idempotency guard: once a task is completed its zip already sits at a
    # stable key, so a retry or duplicate enqueue is a no-op. We deliberately do
    # not re-broadcast or refresh the (possibly expired) presigned URL here — a
    # client needing a fresh link enqueues a new task.
    return if task.completed?

    user = task.user
    album = Album.with_user(user).find(album_id)
    storage = S3::Storage.for(S3Credential.find_by(user: user))

    result = Albums::ZipDownload.call(album: album, user: user, storage: storage, token: task.id)

    if result.success?
      task.update!(status: :completed, result: { "url" => result.url, "s3_key" => result.s3_key })
      broadcast(user.id, task_type: task.task_type, task_id: task.id, status: "completed", album_name: album.name, url: result.url)
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
