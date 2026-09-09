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

  desc "Run the golden set against EVAL_STRATEGY (default lexical) and write a result file"
  task retrieval: :environment do
    %w[corpus golden_set metrics runner].each { |f| require Rails.root.join("lib/eval/#{f}") }

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
