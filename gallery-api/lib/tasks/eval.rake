# The retrieval eval (08). Measurements, not pass/fail — which is why these are rake
# tasks and not specs. Wiring evals into RSpec produces a suite that goes red for
# reasons unrelated to correctness and gets muted within a week.
namespace :eval do
  desc "Fingerprint the corpus and check it for duplicates"
  task :corpus_sha do
    require Rails.root.join("lib/eval/corpus")
    corpus = Eval::Corpus.default

    abort "no corpus at #{corpus.dir}" unless corpus.dir.directory?

    puts "corpus: #{corpus.dir}"
    puts "photos: #{corpus.photo_count}"
    corpus.groups.sort.each { |group, paths| puts format("  %-12s %4d", group, paths.size) }

    # Both of these silently distort the comparison rather than breaking anything, so
    # the fingerprint refuses to certify a corpus that has them.
    failed = false

    corpus.duplicate_content.each do |group|
      warn "duplicate content (identical bytes): #{group.join("  ==  ")}"
      failed = true
    end

    corpus.duplicate_basenames.each do |group|
      warn "duplicate basename (two rows, one title): #{group.join("  ")}"
      failed = true
    end

    abort "corpus not clean — fix the above before recording a fingerprint" if failed

    puts
    puts "corpus_sha: #{corpus.fingerprint}"
    puts
    puts "Record it in #{Eval::Corpus.root.join("queries.yml")} and do not rename a file"
    puts "afterwards: the filename IS the title, so a rename changes what the lexical"
    puts "baseline can find and invalidates every result recorded before it."
  end

  desc "Create albums and Image rows for the corpus (no bytes uploaded)"
  task ingest: :environment do
    require Rails.root.join("lib/eval/corpus")
    require Rails.root.join("lib/eval/ingest")

    email = ENV.fetch("EVAL_USER") { abort "set EVAL_USER=<email> to the account the corpus should belong to" }
    user = User.find_by(email: email) || abort("no user #{email}")

    corpus = Eval::Corpus.default
    abort "no corpus at #{corpus.dir}" unless corpus.dir.directory?

    counts = Eval::Ingest.new(user: user, corpus: corpus).call
    puts "albums: #{counts[:albums]}  created: #{counts[:created]}  already present: #{counts[:existing]}"
    puts
    puts "No bytes were uploaded. These rows carry placeholder s3_keys, which is all the"
    puts "lexical baseline needs (title ILIKE). Semantic runs will need real objects."
  end

  desc "Embed the corpus by reading it off local disk (no S3)"
  task embed: :environment do
    %w[corpus ingest embed].each { |f| require Rails.root.join("lib/eval/#{f}") }

    email = ENV.fetch("EVAL_USER") { abort "set EVAL_USER=<email>" }
    user = User.find_by(email: email) || abort("no user #{email}")

    adapter = Inference.adapter
    unless adapter.available?
      abort "inference is not available (INFERENCE_MODE=#{Inference.config.mode}). " \
            "Start the sidecar and point INFERENCE_ENDPOINT at it."
    end

    corpus = Eval::Corpus.default
    abort "no corpus at #{corpus.dir}" unless corpus.dir.directory?

    counts = Eval::Embed.new(user: user, corpus: corpus, adapter: adapter).call

    if counts[:total].zero?
      puts "Nothing to do: every corpus image already has an embedding for #{counts[:model_id]}."
      next
    end

    puts
    puts "embedded: #{counts[:embedded]}  skipped: #{counts[:skipped]}  missing on disk: #{counts[:missing]}"
    puts "model_id: #{counts[:model_id]}"
    puts
    puts "Re-runnable: which images still need embedding is derived from the absence of"
    puts "a row for this model_id, so a second run does only what is left."
  end

  desc "Run the golden set against EVAL_STRATEGY (default lexical) and write a result file"
  task retrieval: :environment do
    %w[corpus ingest golden_set metrics runner].each { |f| require Rails.root.join("lib/eval/#{f}") }

    email = ENV.fetch("EVAL_USER") { abort "set EVAL_USER=<email>" }
    user = User.find_by(email: email) || abort("no user #{email}")
    strategy = ENV.fetch("EVAL_STRATEGY", "lexical")

    corpus = Eval::Corpus.default
    set = Eval::GoldenSet.load
    set.warnings(corpus: corpus).each { |w| warn "warning: #{w}" }

    result = begin
      Eval::Runner.new(set: set, corpus: corpus, user: user, strategy: strategy).call
    rescue Eval::Runner::UnbuiltStrategy, RuntimeError => e
      abort e.message
    end

    dir = Eval::Corpus.root.join("results")
    dir.mkpath
    path = dir.join("#{Date.current.iso8601}-#{strategy}-#{corpus.fingerprint[0, 8]}.yml")
    path.write(result.to_yaml)

    puts
    puts "strategy:       #{result["strategy"]}  (#{result["ranking"]})"
    puts "queries:        #{result["queries_scored"]}/#{result["queries_total"]} scored"
    puts "returned zero:  #{result["per_query"].count { |q| q["returned"].zero? }}/#{result["queries_total"]}"
    puts "P@5:            #{result["p_at_5"]&.round(4) || "n/a — answer key is empty"}"
    puts "MRR:            #{result["mrr"]&.round(4) || "n/a — answer key is empty"}"
    puts
    puts "wrote #{path}"
    puts "Raw per-query rankings are stored, so this run can be re-scored when the"
    puts "answer key grows. Commit it."
  end

  desc "Lay the pooled results out as one folder of photos per query, for judging by hand"
  task :judging_kit do
    %w[corpus golden_set judging_kit].each { |f| require Rails.root.join("lib/eval/#{f}") }

    corpus = Eval::Corpus.default
    abort "no corpus at #{corpus.dir}" unless corpus.dir.directory?

    set = Eval::GoldenSet.load
    results = Eval::JudgingKit.poolable(Eval::Corpus.root.join("results"), corpus.fingerprint)

    if results.empty?
      abort "no result files recorded against corpus_sha #{corpus.fingerprint[0, 8]}. " \
            "Run eval:retrieval first — the pool is built from what the runs returned, " \
            "not from the corpus."
    end

    summary = begin
      Eval::JudgingKit.new(corpus: corpus, set: set, results: results,
                           force: ENV["EVAL_REBUILD"].present?).call
    rescue Eval::JudgingKit::Incomplete => e
      abort e.message
    end

    puts "pooled from:  #{summary[:sources].join(", ")}"
    puts "folders:      #{summary[:queries]} (#{summary[:skipped]} already judged, skipped)"
    puts "photos:       #{summary[:photos]} copies, #{(summary[:bytes] / 1024.0**2).round} MB"
    puts "at:           #{summary[:dir]}"

    if summary[:empty].any?
      puts
      warn "no run returned anything for: #{summary[:empty].join(", ")} — those folders are " \
           "empty, and an empty pool cannot be judged into an answer key"
    end

    puts
    puts "Judge by deleting: in each folder, remove the photos that are NOT relevant."
    puts "Read #{summary[:dir]}/README.md first, then `bin/rails eval:judgements`."
  end

  desc "Read a judged kit back into queries.yml (dry run unless EVAL_APPLY=1)"
  task :judgements do
    %w[corpus golden_set judging_kit judgements].each { |f| require Rails.root.join("lib/eval/#{f}") }

    corpus = Eval::Corpus.default
    set = Eval::GoldenSet.load
    judgements = Eval::Judgements.new(set: set, corpus: corpus)

    rows = begin
      judgements.read
    rescue Eval::Judgements::Invalid => e
      abort e.message
    end

    abort "no query folders found — run eval:judging_kit first" if rows.empty?

    rows.each do |row|
      flag = if row[:empty] then "  ← nothing kept"
      elsif row[:untouched] then "  ← nothing deleted"
      end
      puts format("  %-5s %-42s %2d of %2d kept%s", row[:id], row[:query][0, 42], row[:kept], row[:pooled], flag)
    end

    untouched = rows.select { |row| row[:untouched] }
    empty = rows.select { |row| row[:empty] }

    puts
    puts "folders: #{rows.size}   judgements: #{rows.sum { |row| row[:kept] }} photo(s)"

    if untouched.any?
      warn "#{untouched.size} folder(s) still hold every photo they were built with: " \
           "#{untouched.map { |row| row[:id] }.join(", ")}. That is what an unjudged folder " \
           "looks like, and also what a query whose pool was entirely relevant looks like. " \
           "Only you can tell the two apart."
    end

    if empty.any?
      warn "#{empty.size} folder(s) have nothing left: #{empty.map { |row| row[:id] }.join(", ")}. " \
           "They will be written as `relevant: []`, which means UNJUDGED to this harness — " \
           "a query with no relevant photo is excluded from the averages, not scored zero."
    end

    unless ENV["EVAL_APPLY"].present?
      puts
      puts "Dry run. Nothing written. Re-run with EVAL_APPLY=1 to write these into"
      puts "#{Eval::Corpus.root.join("queries.yml")}, then check `git diff` — the rewrite"
      puts "touches `relevant:` and `judged_at` and nothing else."
      next
    end

    written = judgements.apply(rows)
    puts
    puts "wrote #{written} answer key(s) and stamped judged_at."
    puts "Now re-run the strategies: their P@5 and MRR are computed against this file."
  end

  desc "Multi-user recall case: split the corpus 95/5 and measure what an ANN index costs the minority user"
  task multi_user: :environment do
    %w[corpus ingest golden_set metrics multi_user].each { |f| require Rails.root.join("lib/eval/#{f}") }

    email = ENV.fetch("EVAL_USER") { abort "set EVAL_USER=<email>" }
    user = User.find_by(email: email) || abort("no user #{email}")

    adapter = Inference.adapter
    unless adapter.available?
      abort "inference is not available (INFERENCE_MODE=#{Inference.config.mode}). " \
            "This case is about the vector path; there is nothing to measure without it."
    end

    corpus = Eval::Corpus.default
    set = Eval::GoldenSet.load

    embedded = ImageEmbedding.where(model_id: adapter.model_id, image_id: Image.with_user(user).select(:id)).count
    unless embedded == corpus.photo_count
      abort "#{embedded} of #{corpus.photo_count} corpus images have an embedding for " \
            "#{adapter.model_id}. Run eval:embed first — a partly embedded corpus makes " \
            "'the index lost rows' and 'the rows were never there' indistinguishable."
    end

    # Big enough that an ANN index is a decision somebody might actually make, and that
    # its graph has neighbours to get lost among. 235 vectors is neither.
    pad = Integer(ENV.fetch("EVAL_PAD", "20000"))

    result = Eval::MultiUser.new(user: user, corpus: corpus, set: set, pad: pad, adapter: adapter).call

    dir = Eval::Corpus.root.join("results")
    dir.mkpath
    path = dir.join("#{Date.current.iso8601}-multi-user-#{corpus.fingerprint[0, 8]}.yml")
    path.write(result.to_yaml)

    split = result["split"]
    puts
    puts "split:      #{split["minority_photos"]} minority / #{split["majority_photos"]} majority " \
         "(+#{split["synthetic_padding"]} synthetic)"
    puts "pgvector:   #{result["pgvector"]}   ef_search: #{result["ef_search"]}   k: #{result["k"]}"
    puts

    [ [ "product path (Images::Search)", "product_path" ], [ "forced onto the index", "forced_ann" ] ].each do |label, key|
      puts label
      Eval::MultiUser::REGIMES.each do |regime|
        row = result[key][regime]
        puts format("  %-15s index used: %-5s  identical to exact: %2d/%-2d  short of k: %2d  mean recall vs exact: %s",
                    regime, row["index_scan"], row["queries_identical_to_exact"], result["queries"],
                    row["queries_short_of_k"], row["mean_recall_vs_exact"]&.round(3) || "n/a")
      end
      puts
    end

    puts "wrote #{path}"
    puts
    puts "Read it in this order. The product path must be identical to exact under every"
    puts "regime — that is the correctness claim. The forced section must NOT be: if it"
    puts "stops dropping under `hnsw`, the case has stopped exercising filtered ANN and"
    puts "the line above it means nothing."
    puts
    puts "Nothing was kept. The split, the padding and the index all lived inside one"
    puts "transaction, which was rolled back."
  end

  desc "Check queries.yml against the corpus without running anything"
  task :validate do
    require Rails.root.join("lib/eval/corpus")
    require Rails.root.join("lib/eval/golden_set")

    corpus = Eval::Corpus.default
    set = Eval::GoldenSet.load

    puts "queries:  #{set.queries.size} (#{set.queries.group_by(&:kind).transform_values(&:size).sort.map { |k, n| "#{n} #{k}" }.join(", ")})"
    puts "judged:   #{set.judged.size}/#{set.queries.size}"
    puts "judged_by: #{set.judged_by || "(blank)"}"
    puts "corpus:   #{corpus.photo_count} photos"

    if set.corpus_sha.blank?
      puts "corpus_sha: (blank) — run `bin/rails eval:corpus_sha` and record it"
    elsif set.corpus_sha == corpus.fingerprint
      puts "corpus_sha: matches"
    else
      puts "corpus_sha: MISMATCH"
      puts "  recorded: #{set.corpus_sha}"
      puts "  actual:   #{corpus.fingerprint}"
    end

    warnings = set.warnings(corpus: corpus)
    if warnings.any?
      puts
      warnings.each { |w| warn "warning: #{w}" }
    end
  end
end
