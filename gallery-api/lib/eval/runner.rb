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

    # `title ILIKE '%q%'` has no relevance score, and nothing in the search path adds
    # an ORDER BY (Image.global_search, BaseApi#apply_filters). Postgres is therefore
    # free to return matching rows in any order it likes, which means the "rank" in a
    # lexical run is an artefact of the query plan.
    #
    # Ordering by id makes a run reproducible — without it two runs over an unchanged
    # corpus could disagree, and every comparison downstream would be noise. It does
    # NOT make the order meaningful, so the result file records the ranking as `none`
    # rather than letting a later reader assume MRR meant something here.
    LEXICAL_ORDER = "images.id ASC".freeze

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

    def search(text)
      case strategy
      when "lexical"
        Image.with_user(user)
             .global_search(text)
             .order(Arel.sql(LEXICAL_ORDER))
             .limit(POOL_DEPTH)
             .pluck(:s3_key)
             .map { |key| key.delete_prefix("eval-corpus/") }
      when "semantic", "hybrid"
        raise UnbuiltStrategy,
              "EVAL_STRATEGY=#{strategy} needs the search endpoint from 07, which is " \
              "not merged. Only `lexical` can run today — and it is the one that has " \
              "to run first, because it is the measurement that becomes unobtainable " \
              "once semantic search is live."
      else
        raise ArgumentError, "unknown strategy #{strategy.inspect}. One of: #{STRATEGIES.join(", ")}"
      end
    end

    def model_id
      return nil if strategy == "lexical"

      Inference.adapter.model_id
    end

    def ranking_description
      return "none — title ILIKE has no relevance score; ordered by id for reproducibility" if strategy == "lexical"

      "cosine"
    end
  end
end
