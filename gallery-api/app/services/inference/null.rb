module Inference
  # The default backend. A fresh self-hosted install does nothing AI-related until
  # the operator opts in — no model download, no sidecar, no GPU requirement, no
  # background jobs piling up for work that will never happen. Search falls back to
  # the existing lexical path.
  class Null < Base
    # Raising rather than returning a zero vector is the most important decision in
    # this class. A zero vector would save, index cleanly, and rank arbitrarily — a
    # failure that surfaces as bad search results weeks later, with nothing in the
    # logs. An exception surfaces at the call site immediately.
    #
    # Implemented as #perform_embed_image rather than #embed_image so that the
    # chokepoint in Base stays the single definition of the public method. Overriding
    # the public one here would make the strip skippable by any backend that felt
    # like it, which is exactly the property the template method is protecting.
    def perform_embed_image(_io) = raise Disabled, "inference is disabled (INFERENCE_MODE=none)"

    def embed_text(_str) = raise Disabled, "inference is disabled (INFERENCE_MODE=none)"

    def model_id = "null"

    # Zero rather than a real width: there is no model, so any non-zero value here
    # would be a claim about a vector space that does not exist. The boot-time
    # dimension assertion (04) skips the check when the adapter is unavailable.
    def dimensions = 0

    def available? = false

    # Ruby's `private` in Base does not survive an override in a subclass unless
    # restated, and callers must not reach perform_embed_image directly.
    private :perform_embed_image
  end
end
