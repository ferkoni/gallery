module Eval
  # queries.yml: the queries, their relevance judgements, and who made them.
  #
  # Loading is strict. Every check here corresponds to a way the eval can produce a
  # number that looks fine and means nothing, and each one is cheap compared to
  # discovering it after a judging afternoon.
  class GoldenSet
    class Invalid < StandardError; end

    KINDS = %w[descriptive broad lexical compositional].freeze

    Query = Data.define(:id, :query, :kind, :group, :relevant) do
      # A query with no judgements has not been judged — it has not scored zero.
      # Averaging it in as 0.0 would report a measurement of the answer key's
      # emptiness and label it retrieval quality.
      def judged? = relevant.any?
    end

    def self.load(path = Corpus.root.join("queries.yml"))
      new(YAML.safe_load_file(path), path)
    end

    attr_reader :path, :version, :judged_by, :judged_at, :corpus_sha, :queries

    def initialize(doc, path = nil)
      @path = path
      @version    = doc["version"]
      @judged_by  = doc["judged_by"].presence
      @judged_at  = doc["judged_at"].presence
      @corpus_sha = doc["corpus_sha"].presence
      @queries = Array(doc["queries"]).map do |q|
        Query.new(
          id:       q["id"],
          query:    q["query"].to_s.strip,
          kind:     q["kind"],
          group:    q["group"],
          relevant: Array(q["relevant"])
        )
      end
      validate!
    end

    def judged = queries.select(&:judged?)
    def unjudged = queries.reject(&:judged?)

    # Warnings, not errors: every one of these describes a set that will still run and
    # produce comparable numbers, but whose result file would mislead a later reader.
    def warnings(corpus: nil)
      warnings = []

      # `lexical` queries are pre-filled by construction — the query IS the filename —
      # so they are not evidence that a judging pass happened. Counting them would let
      # a set with an entirely unjudged key look judged.
      needing_judgement = judged.reject { |q| q.kind == "lexical" }
      if judged_at.present? && needing_judgement.empty?
        warnings << "judged_at is set to #{judged_at} but no query outside `lexical` " \
                    "has a relevance judgement — the answer key is empty. It will read " \
                    "as judged. Clear it until the pooling pass actually runs."
      end

      warnings << "judged_by is blank: 08 wants the judge on record, because when P@5 " \
                  "moves the first question is whether retrieval changed or the " \
                  "judgements did." if judged_by.blank?

      if corpus
        missing = queries.flat_map(&:relevant).uniq - corpus.paths
        warnings << "answer key references #{missing.size} path(s) not in the corpus: " \
                    "#{missing.first(5).join(", ")}" if missing.any?
      end

      warnings
    end

    private

    def validate!
      raise Invalid, "no queries" if queries.empty?

      duplicate_ids = queries.map(&:id).tally.select { |_, n| n > 1 }.keys
      raise Invalid, "duplicate query ids: #{duplicate_ids.join(", ")}" if duplicate_ids.any?

      blank = queries.select { |q| q.query.empty? }.map(&:id)
      raise Invalid, "blank query text: #{blank.join(", ")}" if blank.any?

      # The same string scored twice is one measurement counted twice, and it drags the
      # average toward whatever that one query happens to do.
      dupes = queries.map { |q| q.query.downcase }.tally.select { |_, n| n > 1 }.keys
      raise Invalid, "duplicate query text: #{dupes.map(&:inspect).join(", ")}" if dupes.any?

      unknown = queries.map(&:kind).uniq - KINDS
      raise Invalid, "unknown kind(s): #{unknown.join(", ")}" if unknown.any?
    end
  end
end
