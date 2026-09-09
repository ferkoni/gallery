module Eval
  # Retrieval metrics over one ranked result list and one relevance judgement.
  #
  # Binary relevance throughout: a photo is relevant or it is not. nDCG is deliberately
  # absent — it earns its keep on graded relevance, and against binary judgements it is
  # largely redundant with MRR while being harder to explain.
  module Metrics
    module_function

    # Of the first k results, what fraction were right. The headline number, because it
    # matches how a gallery grid is actually consumed: the user scans the first row and
    # judges instantly.
    #
    # The denominator is k, not the number of results returned. A strategy that returns
    # two results and gets both right has not achieved P@5 = 1.0 — it filled two of five
    # slots. Dividing by the returned count would make an empty-handed strategy look
    # perfect, which matters here specifically: the lexical baseline returns nothing at
    # all for most queries.
    def precision_at(ranked, relevant, k)
      return 0.0 if k.zero?

      (ranked.first(k) & relevant).size.to_f / k
    end

    # Of all the right answers, what fraction surfaced in the top k.
    #
    # Capped at k/|relevant|, which is why 08 warns against averaging this across
    # queries with different relevant-set sizes: a query with ten relevant photos can
    # never exceed R@5 = 0.5, so the average moves when the GOLDEN SET changes rather
    # than when retrieval does. Reported per-query, never averaged, by Runner.
    def recall_at(ranked, relevant, k)
      return 0.0 if relevant.empty?

      (ranked.first(k) & relevant).size.to_f / relevant.size
    end

    # 1 / rank of the first relevant result; 0 when none appears.
    #
    # The right metric for single-answer queries, and sensitive to exactly what a user
    # feels: whether the answer was first or fourth. P@5 cannot tell those apart.
    def reciprocal_rank(ranked, relevant)
      index = ranked.index { |item| relevant.include?(item) }
      index ? 1.0 / (index + 1) : 0.0
    end

    # Mean over judged queries only. Callers must not pass unjudged ones: a query with
    # an empty answer key scores 0.0 on every metric here, and averaging that in
    # reports the emptiness of the key as though it were retrieval quality.
    def mean(values)
      return nil if values.empty?

      values.sum / values.size
    end
  end
end
