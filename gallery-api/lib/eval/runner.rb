module Eval
  # Runs the golden set against one retrieval strategy and writes a result file.
  class Runner
    class UnbuiltStrategy < StandardError; end

    STRATEGIES = %w[lexical semantic hybrid].freeze

    # Judging pools the top 10 (08b §6, TREC pooling), so 10 is what gets stored.
    POOL_DEPTH = 10

    # P@5 is the headline: it matches how a gallery grid is consumed — the user scans
    # the first row and judges instantly.
    K = 5

    # Built once so the metric names in a result file track K instead of being typed
    # out beside it and drifting from it.
    P_AT_K = :"p_at_#{K}"
    RECALL_AT_K = :"recall_at_#{K}"

    attr_reader :set, :corpus, :user, :strategy

    def initialize(set:, corpus:, user:, strategy: "lexical")
      @set = set
      @corpus = corpus
      @user = user
      @strategy = strategy
    end

    def call
      assert_comparable!
      assert_isolated!

      per_query = set.queries.map { |query| evaluate(query) }
      scored = per_query.select { |row| row[:judged] }

      {
        "run_at" => Time.current.iso8601,
        "strategy" => strategy,
        # Recorded on every run because a bare "P@5 = 0.84" six months on is worthless
        # if nobody knows which corpus, which model and which index produced it.
        "corpus_sha" => corpus.fingerprint,
        "photo_count" => corpus.photo_count,
        "model_id" => model_id,
        "prompt_template" => prompt_template,
        "ranking" => ranking_description,
        "index" => "exact",
        "golden_set_version" => set.version,
        "judged_by" => set.judged_by,
        "judged_at" => set.judged_at,
        "queries_total" => per_query.size,
        "queries_scored" => scored.size,
        # nil, not 0.0, when nothing is judged: an empty answer key is an absence of
        # measurement, and reporting it as zero would label it retrieval quality.
        P_AT_K.to_s => Metrics.mean(scored.map { |r| r[P_AT_K] }),
        "mrr" => Metrics.mean(scored.map { |r| r[:mrr] }),
        # Never averaged. recall@k is capped at k/|relevant|, so a mean across queries
        # with different relevant-set sizes moves when the golden set changes rather
        # than when retrieval does (08).
        "per_query" => per_query.map { |row| row.transform_keys(&:to_s) }
      }
    end

    private

    # A run against a corpus the answer key was not judged against is not comparable to
    # anything, and quietly producing a number would be worse than refusing.
    def assert_comparable!
      return if set.corpus_sha.blank? || set.corpus_sha == corpus.fingerprint

      raise "corpus changed since the golden set was judged — results would not be " \
            "comparable.\n  recorded: #{set.corpus_sha}\n  actual:   #{corpus.fingerprint}"
    end

    # The eval user must own the corpus and nothing else. A stray row — a dev photo, a
    # leftover from another run — is returned by search like any other, scores against
    # P@5, and is not covered by corpus_sha, so the run would be measuring a corpus
    # nobody can reconstruct.
    #
    # Enforced by counting rather than by adding a WHERE clause to the search, on
    # purpose: an extra predicate changes the shape of the query being measured, and
    # for the semantic strategies that is precisely the filtered-ANN trap from 01. The
    # query the eval runs must stay the query the product runs.
    def assert_isolated!
      owned = Image.with_user(user).count
      return if owned == corpus.photo_count

      raise "eval user owns #{owned} image(s) but the corpus has #{corpus.photo_count}. " \
            "Search would return rows that are not in corpus_sha. Use a user dedicated " \
            "to the corpus."
    end

    def evaluate(query)
      ranked = search(query.query)
      relevant = query.relevant

      row = {
        id: query.id,
        query: query.query,
        kind: query.kind,
        returned: ranked.size,
        judged: query.judged?,
        # Stored on EVERY run, unconditionally. This is what makes a growing answer key
        # survivable: when a later strategy surfaces a relevant photo this one never
        # found, the judgement is added and every earlier run is re-scored from its raw
        # output. A run that kept only its score cannot be re-scored, and comparing its
        # old number to a new one computed against a larger key is meaningless.
        ranked: ranked
      }

      return row.merge(P_AT_K => nil, RECALL_AT_K => nil, mrr: nil) unless query.judged?

      row.merge(
        P_AT_K => Metrics.precision_at(ranked, relevant, K),
        RECALL_AT_K => Metrics.recall_at(ranked, relevant, K),
        relevant_count: relevant.size,
        mrr: Metrics.reciprocal_rank(ranked, relevant)
      )
    end

    # Goes through Images::Search — the same class the controller reaches — rather than
    # rebuilding retrieval here. An eval that reimplements the thing it measures
    # eventually measures the reimplementation.
    def search(text)
      raise ArgumentError, "unknown strategy #{strategy.inspect}. One of: #{STRATEGIES.join(", ")}" unless
        STRATEGIES.include?(strategy)

      Images::Search
        .call(scope: Image.with_user(user), query: text, strategy: strategy)
        .limit(POOL_DEPTH)
        .pluck(:s3_key)
        .map { |key| Ingest.path_for(key) }
    end

    def model_id
      return nil if strategy == "lexical"

      Inference.adapter.model_id
    end

    # Recorded on every run, because it changes results without changing a single
    # stored row: it is applied to the query only. A result file that did not name it
    # would be incomparable to one run under a different wording.
    def prompt_template
      return nil if strategy == "lexical"

      Inference.config.prompt_template
    end

    def ranking_description
      case strategy
      when "lexical" then "none — title ILIKE has no relevance score; ordered by id for reproducibility"
      when "semantic" then "cosine"
      when "hybrid" then "RRF k=#{Images::Search::RRF_K} over lexical and semantic, capped at #{Images::Search::CANDIDATE_LIMIT} each"
      end
    end
  end
end
