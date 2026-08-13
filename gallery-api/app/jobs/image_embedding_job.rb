class ImageEmbeddingJob < ApplicationJob
  # Its own lane, at concurrency 1. Inference serializes on a single GPU, so a second
  # worker would not be faster — it would hold a database connection and memory to
  # wait its turn, while album downloads queued behind it. See config/queue.yml.
  queue_as :inference

  # The sidecar downloads several hundred megabytes of weights on first boot and is
  # slow to become healthy, so transport failure is expected rather than exceptional.
  # This is the one error class where retrying the identical request is the right
  # move: nothing about the request was wrong.
  retry_on Inference::Unavailable, attempts: 5, wait: :polynomially_longer

  # Deliberately no class-level `discard_on Inference::InvalidInput`. That would throw
  # away every image in the job because one file was corrupt. Handled per image below,
  # where the blast radius is the one file that is actually broken.

  # model_id is the space this batch was SELECTED for, and it is not what gets stored:
  # that is always the model_id from the response that produced the vector. Carrying
  # the selection separately is what makes a mid-run sidecar swap visible rather than
  # silently mixing two vector spaces in one column.
  def perform(image_ids, model_id:)
    adapter = Inference.adapter
    # Not an error. Inference can be switched off, or the sidecar can be down, between
    # this job being enqueued and being picked up. The backfill is idempotent, so
    # doing nothing now costs only a re-run later.
    return unless adapter.available?

    images_needing(image_ids, model_id).group_by(&:user).each do |user, images|
      embed_for(user, images, adapter)
    end
  end

  private

  # Re-applying the selection inside the job is what makes re-running free rather than
  # merely safe: an image already embedded for this model is skipped before any bytes
  # are fetched from S3 or any GPU work happens. The unique index from 04 would catch
  # a duplicate anyway, but only after paying for the embedding.
  def images_needing(image_ids, model_id)
    Image.where(id: image_ids).needing_embedding(model_id).includes(:user)
  end

  # Grouped by user because every image in a group needs the same S3 gateway, built
  # from that user's own encrypted credentials. Ungrouped, this would construct and
  # discard a gateway per image.
  def embed_for(user, images, adapter)
    storage = S3::Storage.for(S3Credential.find_by(user: user))
    # S3::Storage.for returns nil for a user with no credentials. That is "skip this
    # user's images", not a failure — they have no bucket for the bytes to be in.
    return if storage.nil?

    images.each { |image| embed(image, storage, adapter) }
  end

  def embed(image, storage, adapter)
    # Bytes, never a presigned URL. A presigned URL is a bearer token to a private
    # object in the user's own bucket, and handing one to an inference backend would
    # send the credential rather than the content — see 02.
    embedding = adapter.embed_image(fetch_bytes(storage, image.s3_key))

    ImageEmbedding.create!(
      image: image,
      embedding: embedding.vector,
      # Straight from the response that produced this vector, never from local config.
      model_id: embedding.model_id,
      dimensions: embedding.dimensions
    )
  rescue Inference::InvalidInput => e
    # Not an image, or undecodable. It will fail identically forever, so retrying only
    # delays the inevitable and burns GPU time. Skipping keeps the rest of the batch
    # moving and leaves no failed-job row demanding attention for a file that is
    # simply broken.
    logger.warn("ImageEmbeddingJob: skipping image #{image.id}: #{e.message}")
  rescue ActiveRecord::RecordNotUnique
    # Another worker embedded this image between the selection above and this write.
    # The unique index from 04 is doing exactly its job; nothing to report.
    logger.debug("ImageEmbeddingJob: image #{image.id} already embedded, skipping")
  end

  # Buffered rather than streamed onward: the adapter takes an IO it can read whole,
  # and CLIP needs the entire image before it can preprocess anything. Binary
  # encoding matters — a default-encoding StringIO corrupts JPEG bytes on write.
  def fetch_bytes(storage, key)
    buffer = StringIO.new(String.new(encoding: Encoding::BINARY))
    storage.stream_object(key) { |chunk| buffer.write(chunk) }
    buffer.rewind
    buffer
  end
end
