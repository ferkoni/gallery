module Images
  # Chooses a retrieval strategy from adapter availability, never from a request
  # parameter. The client sends the same `?q=` either way, so a self-hosted install
  # that never enables inference behaves exactly as it did before this shipped — and
  # "is AI on" never becomes a decision the frontend has to make.
  class Search < Base
    # RRF's published default (Cormack et al., 2009). Damps the difference between
    # ranks 1 and 2 while still separating rank 1 from rank 50.
    RRF_K = 60

    # How deep each strategy ranks before fusion. RRF needs BOTH complete lists before
    # it can score anything, so LIMIT/OFFSET cannot be pushed into either underlying
    # query — the cap is what stops that from meaning "load the whole library".
    #
    # The real limitation this buys: a photo at fused rank 250 is unreachable. For a
    # personal gallery, where the interesting results are on the first screen, that is
    # an acceptable trade — written down here rather than discovered later.
    CANDIDATE_LIMIT = 200

    STRATEGIES = %i[lexical semantic hybrid].freeze

    # `strategy:` exists for the eval harness (08), which has to measure lexical,
    # semantic and hybrid independently against one frozen corpus — that comparison is
    # the actual deliverable of the eval, and it cannot be produced if the strategy is
    # only ever chosen implicitly.
    #
    # It is NOT reachable from a request. BaseApi#apply_filters passes only the query,
    # so the client sends the same ?q= regardless and never has to know whether this
    # install has AI. Forcing a strategy from a parameter would fork the frontend and
    # undo what the Null adapter is for.
    def initialize(scope:, query:, strategy: nil)
      @scope = scope
      @query = query.to_s
      @strategy = strategy&.to_sym
    end

    def call
      return @scope.none if @query.blank?
      return public_send(@strategy) if @strategy

      return lexical unless Inference.adapter.available?

      hybrid
    rescue Inference::Error => e
      # The single most important rescue in the feature. A sidecar restarting to load
      # new weights must degrade search to "temporarily less clever", never to a 500.
      # Catching Inference::Error rather than Unavailable covers OutOfMemory and a
      # misconfigured Disabled too: from the searcher's point of view they are the same
      # event — no vector today, answer the query anyway.
      Rails.logger.warn("Images::Search: inference unavailable (#{e.class}), falling back to lexical")
      lexical
    end

    def lexical
      order_by_ids(lexical_ids)
    end

    def semantic
      order_by_ids(semantic_ids)
    end

    def hybrid
      # Fusion order is irrelevant — RRF is symmetric — but semantic goes first so a
      # zero-length lexical list (the common case for a natural-language query) reads
      # as what it is rather than looking like a bug.
      order_by_ids(fuse(semantic_ids, lexical_ids))
    end

    private

    # Ranked by position only, never by score.
    #
    # The naive blend is 0.5 * lexical + 0.5 * semantic, and it is wrong here for a
    # concrete reason: the modality gap (01) means a *perfect* text-to-image match
    # scores about 0.2-0.3 cosine, while ILIKE yields a boolean. There is no shared
    # scale and no honest normalization between them, so any weighting is a number
    # nobody can defend. RRF never looks at a similarity value at all.
    #
    # Agreement beats a single strong opinion: rank 1 in one list alone scores
    # 1/61 = 0.0164, while rank 3 in both scores 2/63 = 0.0317 and wins.
    def fuse(*ranked_id_lists)
      scores = Hash.new(0.0)
      ranked_id_lists.each do |ids|
        ids.each_with_index { |id, index| scores[id] += 1.0 / (RRF_K + index + 1) }
      end
      scores.sort_by { |id, score| [ -score, id ] }.map(&:first)
    end

    # `title ILIKE '%q%' OR q = ANY(tags)` has no relevance score, and until now
    # nothing in the search path ordered it at all — so Postgres returned matching rows
    # in whatever order the plan produced. That was already a bug (paginated results
    # could repeat or skip rows), and it is fatal to fusion, which reads positions.
    #
    # Ordering by id does not make the order *meaningful* — lexical has no notion of
    # better — but it makes it stable, which is what RRF and OFFSET both require.
    def lexical_ids
      @scope.lexical_search(@query).order(:id).limit(CANDIDATE_LIMIT).pluck(:id)
    end

    def semantic_ids
      vector = Inference::QueryEmbedding.for(@query)
      model_id = Inference.adapter.model_id

      ImageEmbedding
        .where(model_id: model_id, image_id: @scope.select(:id))
        .nearest_neighbors(:embedding, vector, distance: "cosine")
        # A tiebreaker, so equal distances do not shuffle between runs. Without it the
        # candidate list is nondeterministic and two identical searches can fuse
        # differently.
        .order(:image_id)
        .limit(CANDIDATE_LIMIT)
        .pluck(:image_id)
    end

    # Chained onto @scope rather than starting a fresh Image.where, so every condition
    # the caller already applied — above all `with_user`, which is what prevents
    # cross-user leakage — stays in the SQL instead of being trusted to have been
    # baked into the id list.
    def order_by_ids(ids)
      return @scope.none if ids.empty?

      @scope.where(id: ids).in_order_of(:id, ids)
    end
  end
end
