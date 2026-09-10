module Inference
  # The query side of retrieval: text in, cached vector out.
  #
  # Separate from the adapter because everything here is a *search* concern rather
  # than a backend concern — the template and the cache must be identical in the eval
  # harness and in the request path, and a backend has no business knowing either.
  class QueryEmbedding
    # Query text repeats far more than image content does: the same handful of
    # searches, plus every keystroke of the frontend's debounced box. Image embeddings
    # are never cached — each photo is embedded exactly once, ever — so this is the
    # cheapest available win on search latency and it exists only on this side.
    TTL = 1.day

    def self.for(query, adapter: Inference.adapter) = new(query, adapter: adapter).call

    def initialize(query, adapter: Inference.adapter)
      @query = query.to_s
      @adapter = adapter
    end

    def call
      Rails.cache.fetch(cache_key, expires_in: TTL) { @adapter.embed_text(templated).vector }
    end

    # `"a photo of {query}"` measurably beats a bare keyword, because the text encoder
    # was trained on captions rather than search terms (01).
    #
    # Off by default, and that is deliberate: whether it helps *this* corpus in *this*
    # language is a measurable question, and 08's comparison table has a row for it.
    # Shipping it on by default would bake in an assumption the eval exists to test —
    # and with a multilingual tower there is a second open question underneath, namely
    # whether the template should be in the query's language or the model's.
    def templated
      template = Inference.config.prompt_template
      return @query if template.blank?

      format(template.sub("{query}", "%{query}"), query: @query)
    end

    private

    # model_id and template both belong in the key. The first is obvious. The second is
    # the one that silently poisons a cache: change the template, and every previously
    # cached entry answers with a vector built from the old wording.
    #
    # Note what is NOT here: the template does not belong in model_id itself. It is
    # applied only to queries, so it cannot affect a single stored image row — bumping
    # model_id for a template change would invalidate the entire library to reflect a
    # change that never touched it.
    def cache_key
      [ "inference/query", @adapter.model_id, Inference.config.prompt_template.to_s, @query ]
    end
  end
end
