class AlbumDownloadJob < ApplicationJob
  retry_on StandardError, attempts: 3, wait: :polynomially_longer

  def perform(task_id)
    # Zip generation and S3 upload implemented in issue #39
  end
end
