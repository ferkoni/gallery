module Inference
  # A single embedding plus the identity of the model that produced it. The model_id
  # travels with the vector because a vector alone is meaningless — comparing two
  # embeddings from different models produces plausible numbers and wrong answers.
  #
  # Follows the Images::Result idiom in app/services/images/base.rb: Data.define,
  # immutable, no ceremony.
  Embedding = Data.define(:vector, :model_id, :dimensions)

  class Base
    # Template method, and the reason this class wraps rather than delegates.
    #
    # Backends implement #perform_embed_image and never receive raw user bytes:
    # metadata stripping belongs HERE, above the backend seam, so no backend can
    # leak GPS data regardless of how it is configured or who writes the next one.
    # A future Inference::SomeNewVendor inherits the guarantee without its author
    # knowing the guarantee exists — a safety property rather than a review convention.
    #
    # Note what this signature does NOT give you: an IO can contain EXIF. It is a
    # stream of bytes, and if those bytes are a JPEG the GPS block is still in them.
    # Taking an IO rather than a URL prevents a *credential* escaping — a presigned
    # S3 URL is a bearer token to the untouched original. Preventing *content* from
    # escaping is the strip below. Two guarantees, two mechanisms, both required.
    #
    # Exif::Strip raises its own error rather than one of ours, so that it stays
    # usable from the upload path without dragging the inference taxonomy along.
    # Translating it here is the whole of that coupling: undecodable bytes will fail
    # identically forever, which is precisely what InvalidInput means to 06's retry
    # logic — discard, never retry.
    def embed_image(io)
      perform_embed_image(Exif::Strip.call(io))
    rescue Exif::Strip::UndecodableImage => e
      raise InvalidInput, e.message
    end

    # Text needs no stripping, so it has no template method — a string carries no
    # metadata to remove.
    def embed_text(_str) = raise NotImplementedError

    # Identity of the model, recorded on every row this adapter produces.
    # Changing the weights, the preprocessing, or the query template must change this.
    def model_id = raise NotImplementedError

    # Vector length. Must agree with the pgvector column; asserted at boot once 04 lands.
    def dimensions = raise NotImplementedError

    # False for Null, and for a backend whose sidecar is unreachable. Callers use this
    # to choose between semantic and lexical search rather than rescuing an exception.
    # A question about configuration deserves an answer, not a raise.
    def available? = false

    private

    def perform_embed_image(_io) = raise NotImplementedError
  end
end
