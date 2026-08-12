module Inference
  # A backend that returns deterministic vectors without loading anything.
  #
  # Lives in spec/support rather than app/ on purpose: it is test scaffolding, not a
  # shipped backend, and putting it in app/ would make it resolvable in production.
  #
  # This class is the concrete answer to "why build the seam before the feature" —
  # every spec in 06 and 07 can run in CI with no GPU, no Python, no model download,
  # and no network.
  class Fake < Base
    DIMENSIONS = 512

    def embed_text(str) = deterministic(str)

    def model_id = "fake-v1"

    def dimensions = DIMENSIONS

    def available? = true

    private

    def perform_embed_image(io) = deterministic(io.read)

    # Seeded from the input so the same input always embeds identically and different
    # inputs do not collide — tests can assert that two different photos rank
    # differently without knowing anything about CLIP.
    #
    # L2-normalized because the real thing is: ImageEmbedding validates the norm (04),
    # so a fake producing unnormalized vectors would fail validation in exactly the
    # tests it exists to enable.
    def deterministic(input)
      seed = Digest::SHA256.hexdigest(input.to_s).to_i(16)
      rng = Random.new(seed)
      raw = Array.new(DIMENSIONS) { rng.rand(-1.0..1.0) }
      norm = Math.sqrt(raw.sum { |x| x * x })

      Embedding.new(
        vector: raw.map { |x| x / norm },
        model_id: model_id,
        dimensions: DIMENSIONS
      )
    end
  end
end
