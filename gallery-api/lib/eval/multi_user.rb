module Eval
  # The multi-user recall case (08 validation 6). A CORRECTNESS test for the
  # filtered-ANN trap in 01, not a quality measurement — nothing here reads a relevance
  # judgement, and the answer key may be entirely empty without affecting the result.
  #
  # The bug it exists for: an ANN index walks a graph built over EVERY row in the table
  # and hands back its `ef_search` best candidates before `WHERE images.user_id = $1` is
  # ever consulted. A user holding 5% of the photos loses nearly all of those candidates
  # to the filter and gets a short result set — or an empty one — while exact search
  # would have answered fine. It raises nothing, logs nothing, and looks exactly like
  # "you have no matching photos". Single-user development cannot surface it.
  #
  # The scenario is destructive by nature — it reassigns ownership of corpus rows and
  # creates an index — so the whole run happens inside a transaction that is always
  # rolled back. Nothing it does survives the process.
  class MultiUser
    # Deliberately not `eval-corpus@gallery.local`. This user exists only inside the
    # rolled-back transaction; if either address is ever found in a database, something
    # went wrong here rather than in ingest.
    MINORITY_EMAIL = "eval-minority@gallery.local".freeze
    BULK_EMAIL = "eval-bulk@gallery.local".freeze

    # Every 20th photo by id → 5%, and spread across all six groups rather than taken
    # from one. A minority user holding one whole group would confound two different
    # effects: having few candidates, and having topically clustered ones. Only the
    # first is what this measures.
    MINORITY_EVERY = 20

    # What a gallery grid shows first, and the depth at which "returned fewer rows than
    # asked for" is the visible symptom.
    K = 10

    # pgvector's default, pinned explicitly so the run does not silently measure
    # whatever the server happened to be configured with. It is also the number that
    # makes the trap arithmetic legible: 40 candidates fetched globally, of which the
    # minority user's share is 5%, is 2.
    EF_SEARCH = 40

    INDEX_NAME = "index_image_embeddings_hnsw_eval".freeze

    # Named so a result file says which regime produced which numbers.
    #   exact           — no index at all. The ground truth every other regime is scored against.
    #   hnsw            — index present, iterative scan off. The trap, if it fires.
    #   hnsw_iterative  — index present, hnsw.iterative_scan = relaxed_order. The mitigation 04 requires.
    #   hnsw_strict     — the same, at strict_order. Present because relaxed_order returns the
    #                     right rows in a not-quite-right ORDER, and hybrid search fuses on
    #                     rank position: a reordered semantic list changes what RRF outputs.
    REGIMES = %w[exact hnsw hnsw_iterative hnsw_strict].freeze

    ITERATIVE_SCAN = {
      "exact" => "off", "hnsw" => "off",
      "hnsw_iterative" => "relaxed_order", "hnsw_strict" => "strict_order"
    }.freeze

    attr_reader :user, :corpus, :set, :pad, :adapter

    def initialize(user:, corpus:, set:, pad: 0, adapter: Inference.adapter)
      @user = user
      @corpus = corpus
      @set = set
      @pad = pad
      @adapter = adapter
    end

    def call
      # Warmed before the transaction opens, for two reasons: every regime must be
      # compared against the same query vector or the comparison measures the sidecar's
      # nondeterminism instead of the index, and Rails.cache is solid_cache in
      # production — a cache write belongs outside a transaction that will be rolled back.
      vectors = warm_query_vectors

      result = nil
      ActiveRecord::Base.transaction do
        minority = split!
        padded = pad!

        product = REGIMES.to_h { |regime| [ regime, with_regime(regime) { product_path(minority, vectors) } ] }
        forced = REGIMES.to_h { |regime| [ regime, with_regime(regime) { forced_ann(minority, vectors) } ] }

        result = report(minority: minority, padded: padded, product: product, forced: forced)

        # Always. There is no success path that keeps any of this.
        raise ActiveRecord::Rollback
      end
      result
    end

    private

    def queries = set.queries

    def model_id = adapter.model_id

    def warm_query_vectors
      queries.to_h { |query| [ query.id, Inference::QueryEmbedding.for(query.query, adapter: adapter) ] }
    end

    # Moves 5% of the corpus to a second user, keeping the group structure: an image
    # that lived in `pets` still lives in an album called `pets`, so a result file's
    # paths read the same as every other run's.
    def split!
      minority = User.create!(email: MINORITY_EMAIL, password: SecureRandom.hex(16))

      Image.with_user(user).order(:id).each_slice(MINORITY_EVERY).map(&:first).each do |image|
        group = Ingest.path_for(image.s3_key).split("/").first
        album = Album.find_or_create_by!(user: minority, name: group) do |a|
          a.description = "Multi-user recall case (rolled back)"
        end
        image.update_columns(user_id: minority.id, album_id: album.id)
      end

      minority
    end

    # Synthetic rows owned by nobody who matters, to put enough vectors in the table for
    # an ANN index to be a decision a real installation might make. 235 photos is far
    # below the point where anyone would reach for HNSW, and an index built over 235
    # vectors has too few graph neighbours to fail in the way this is looking for.
    #
    # Random unit vectors, generated in SQL. They are noise, and that is correct: they
    # are not there to be found, they are there to be walked past.
    def pad!
      return 0 if pad.to_i <= 0

      bulk = User.create!(email: BULK_EMAIL, password: SecureRandom.hex(16))
      album = Album.create!(user: bulk, name: "pad", description: "Multi-user recall case (rolled back)")

      execute_sql(<<~SQL.squish, bulk.id, album.id, pad.to_i)
        INSERT INTO images (user_id, album_id, title, s3_key, tags, created_at, updated_at)
        SELECT ?, ?, 'pad-' || g, 'pad/' || g, '{}', now(), now()
        FROM generate_series(1, ?) g
      SQL

      # One vector per row, built by joining each image against 512 generated values and
      # aggregating. The obvious spelling — a scalar subquery per row — is a trap:
      # `(SELECT array_agg(random() - 0.5) FROM generate_series(1, 512))` has no outer
      # reference, so Postgres evaluates it ONCE as an InitPlan and every padding row
      # gets the same vector. That produced 20,000 copies of a single point, an index
      # whose graph is one degenerate cluster, and recall numbers that moved between runs
      # for reasons having nothing to do with the filter.
      execute_sql(<<~SQL.squish, model_id, ImageEmbedding.column_dimensions, ImageEmbedding.column_dimensions, bulk.id)
        INSERT INTO image_embeddings (image_id, model_id, dimensions, embedding, created_at, updated_at)
        SELECT i.id, ?, ?,
               l2_normalize(array_agg(random() - 0.5 ORDER BY g)::vector), now(), now()
        FROM images i CROSS JOIN generate_series(1, ?) g
        WHERE i.user_id = ?
        GROUP BY i.id
      SQL

      assert_padding_is_noise!(bulk)

      # Without this the planner is costing against statistics from before the padding,
      # which is the one thing that would make "the planner did not choose the index" an
      # artefact of this harness rather than a fact about the query.
      connection.execute("ANALYZE images")
      connection.execute("ANALYZE image_embeddings")

      pad.to_i
    end

    # The padding exists to give the index a crowd to lose the minority user in, and a
    # crowd of identical points is not one. Checked rather than assumed because the way
    # this fails is silent: the rows are there, the counts are right, the run produces
    # numbers, and only the numbers are wrong.
    def assert_padding_is_noise!(bulk)
      distinct = connection.select_value(sanitize(<<~SQL.squish, bulk.id))
        SELECT count(DISTINCT e.embedding)
        FROM image_embeddings e JOIN images i ON i.id = e.image_id
        WHERE i.user_id = ?
      SQL

      return if distinct.to_i == pad.to_i

      raise "padding produced #{distinct} distinct vectors for #{pad} rows. Every padding " \
            "row must have its own direction, or the index is built over a degenerate " \
            "cluster and the recall numbers below mean nothing."
    end

    # The index, the iterative-scan setting and ef_search, established for the block and
    # torn down after it. `SET LOCAL` is scoped to the transaction, not to the block —
    # and the whole run is one transaction — so resetting explicitly is not optional.
    def with_regime(regime)
      create_index! if regime.start_with?("hnsw")
      connection.execute("SET LOCAL hnsw.ef_search = #{EF_SEARCH}")
      connection.execute("SET LOCAL hnsw.iterative_scan = #{ITERATIVE_SCAN.fetch(regime)}")

      yield
    ensure
      connection.execute("RESET hnsw.iterative_scan")
      connection.execute("RESET hnsw.ef_search")
      drop_index!
    end

    def create_index!
      connection.execute(<<~SQL.squish)
        CREATE INDEX #{INDEX_NAME} ON image_embeddings USING hnsw (embedding vector_cosine_ops)
      SQL
    end

    def drop_index!
      connection.execute("DROP INDEX IF EXISTS #{INDEX_NAME}")
    end

    # What the product actually runs — through Images::Search, the class the controller
    # reaches, rather than a copy of its query. An eval that reimplements the thing it
    # measures eventually measures the reimplementation. If this disagrees with `exact`,
    # a second user's search is broken.
    def product_path(minority, vectors)
      scope = Image.with_user(minority)

      queries.map do |query|
        ranked = Images::Search.call(scope: scope, query: query.query, strategy: "semantic")
                               .limit(K).pluck(:s3_key).map { |key| Ingest.path_for(key) }

        {
          "id" => query.id,
          "ranked" => ranked,
          # EXPLAINed on a reconstruction, and only for this one question. By the time
          # Images::Search returns, its vector query has already run and what comes back
          # is an Image relation keyed by id — which can say nothing about whether the
          # ANN index was consulted. Built exactly as Images::Search#semantic_ids builds
          # it; if the two ever drift, this column starts lying.
          "index_scan" => index_scan?(
            semantic_relation(scope, vectors.fetch(query.id))
              .order(:image_id).limit(Images::Search::CANDIDATE_LIMIT)
          )
        }
      end
    end

    # The same vectors and the same filter, with two deliberate deviations from the
    # product query: the `image_id` tiebreaker is dropped, and every non-index plan is
    # switched off so the HNSW path is the only one the planner has left.
    #
    # This section is here because of the validation rule that a check which cannot fail
    # is decoration. The product path (above) is expected to be identical to exact under
    # every regime — and an expectation that holds for the wrong reason is worth nothing.
    # This one shows the harness watching the failure actually happen: same corpus, same
    # split, same index, recall collapses. If THIS ever stops dropping under `hnsw`, the
    # scenario has stopped exercising filtered ANN and the product-path result means
    # nothing either.
    def forced_ann(minority, vectors)
      scope = Image.with_user(minority)

      force_index_only_plans!
      queries.map do |query|
        relation = semantic_relation(scope, vectors.fetch(query.id)).limit(K)
        {
          "id" => query.id,
          "ranked" => paths_for(relation),
          "index_scan" => index_scan?(relation)
        }
      end
    ensure
      release_plan_forcing!
    end

    # Deliberately built here rather than called through Images::Search: the forced
    # section has to remove the tiebreaker, which the service quite rightly does not
    # expose. Keep the rest identical to Images::Search#semantic_ids — a divergence here
    # turns this into a test of a query the product never runs.
    def semantic_relation(scope, vector)
      ImageEmbedding
        .where(model_id: model_id, image_id: scope.select(:id))
        .nearest_neighbors(:embedding, vector, distance: "cosine")
    end

    def force_index_only_plans!
      %w[enable_seqscan enable_hashjoin enable_mergejoin enable_sort].each do |guc|
        connection.execute("SET LOCAL #{guc} = off")
      end
    end

    def release_plan_forcing!
      %w[enable_seqscan enable_hashjoin enable_mergejoin enable_sort].each do |guc|
        connection.execute("RESET #{guc}")
      end
    end

    # Plucked ONCE and reused. Executing the relation twice — `where(id: pluck)` and
    # `in_order_of(:id, pluck)` — was this file's first real bug: under
    # `iterative_scan = relaxed_order` an approximate scan need not return the same rows
    # twice, `in_order_of` also filters, and the two executions intersected to nothing.
    # It showed up as one query returning zero rows under the mitigation, which reads
    # exactly like the failure this whole case is hunting for.
    def paths_for(relation)
      ids = relation.pluck(:image_id)

      Image.where(id: ids).in_order_of(:id, ids).pluck(:s3_key).map { |key| Ingest.path_for(key) }
    end

    # Answers "was the ANN index actually consulted", which is the difference between a
    # run that proves something and a run that proves the planner ignored us.
    def index_scan?(relation)
      plan = connection.select_value("EXPLAIN (FORMAT JSON) #{relation.to_sql}")
      plan = JSON.parse(plan) if plan.is_a?(String)
      plan.to_s.include?(INDEX_NAME)
    end

    def report(minority:, padded:, product:, forced:)
      truth = product.fetch("exact").to_h { |row| [ row["id"], row["ranked"] ] }

      {
        "run_at" => Time.current.iso8601,
        "case" => "multi-user recall (filtered ANN)",
        "corpus_sha" => corpus.fingerprint,
        "photo_count" => corpus.photo_count,
        "model_id" => model_id,
        "prompt_template" => Inference.config.prompt_template,
        "golden_set_version" => set.version,
        "queries" => queries.size,
        "k" => K,
        "ef_search" => EF_SEARCH,
        "pgvector" => connection.select_value("SELECT extversion FROM pg_extension WHERE extname = 'vector'"),
        "split" => {
          "minority_photos" => Image.with_user(minority).count,
          "majority_photos" => Image.with_user(user).count,
          "synthetic_padding" => padded
        },
        # The product's own query, which is the thing that has to be correct.
        "product_path" => REGIMES.to_h { |regime| [ regime, summarize(product.fetch(regime), truth, regime) ] },
        # The deliberate trip, which is the thing that proves the check can fail.
        "forced_ann" => REGIMES.to_h { |regime| [ regime, summarize(forced.fetch(regime), truth, regime) ] }
      }
    end

    # Scored against exact search, never against the answer key. "Did the index change
    # what a second user can find" is answerable with an entirely unjudged golden set,
    # which is precisely why this case could be built before the judging pass.
    #
    # Rankings are kept for `exact`, which is the ground truth, and afterwards only
    # where a regime DISAGREED with it — so the photos an index cost this user are named
    # in the file and the other five sixths of it are not the same list repeated. This
    # is the one place the harness does not store raw output unconditionally: Runner's
    # reason for doing so is re-scoring against a growing answer key, and this case
    # never reads the answer key at all.
    def summarize(rows, truth, regime)
      scored = rows.map do |row|
        expected = truth.fetch(row["id"])
        found = row["ranked"]
        identical = found == expected

        scored = row.merge(
          "returned" => found.size,
          "expected" => expected.size,
          "identical" => identical,
          # Of what exact search would have shown this user, how much survived.
          "recall_vs_exact" => expected.empty? ? nil : ((found & expected).size.to_f / expected.size)
        )
        identical && regime != "exact" ? scored.except("ranked") : scored
      end

      recalls = scored.filter_map { |row| row["recall_vs_exact"] }

      {
        "index_scan" => scored.any? { |row| row["index_scan"] },
        "queries_identical_to_exact" => scored.count { |row| row["identical"] },
        "queries_short_of_k" => scored.count { |row| row["returned"] < [ K, row["expected"] ].min },
        "mean_recall_vs_exact" => Metrics.mean(recalls),
        "per_query" => scored
      }
    end

    def connection = ActiveRecord::Base.connection

    # Every value that reaches these statements is an id this class just created or a
    # column width read from the schema, but interpolating them anyway would leave a
    # file of hand-rolled SQL for the next person to copy from. Bind them.
    def execute_sql(sql, *values) = connection.execute(sanitize(sql, *values))

    def sanitize(sql, *values) = ActiveRecord::Base.sanitize_sql_array([ sql, *values ])
  end
end
