module Eval
  # Turns the committed result files into something a person can actually judge: one
  # folder per query, holding a copy of every photo any run returned for it.
  #
  # This is TREC pooling (08b §6) with the pool laid out on disk instead of in a
  # spreadsheet. Judging happens by DELETING: whatever is left in a folder when you are
  # finished is that query's answer key, and `eval:judgements` reads it back.
  #
  # Two decisions worth knowing about, both aimed at not biasing the judge:
  #
  # The files are named `group__filename`, with no rank prefix. A pool judged in rank
  # order gets judged more generously at the top, which inflates exactly the metric the
  # ranking is being measured by. Alphabetical order carries no information about which
  # run liked a photo or how much.
  #
  # And the pool is the UNION across strategies, unlabelled. If the semantic run's
  # rank 1 were marked as such, a judge who knows the feature is meant to work would be
  # judging their own expectations.
  class JudgingKit
    class Incomplete < StandardError; end

    # The separator between group and filename. Two underscores rather than one because
    # corpus filenames contain single ones (`IMG_20240116_102306.jpg`); they do not
    # contain doubles, and the corpus fingerprint task already refuses duplicate
    # basenames, so this round-trips.
    SEPARATOR = "__".freeze

    QUERY_FILE = "_query.txt".freeze

    attr_reader :corpus, :set, :results, :dir, :force

    def initialize(corpus:, set:, results:, dir: Corpus.root.join("judging"), force: false)
      @corpus = corpus
      @set = set
      @results = results
      @dir = Pathname(dir)
      @force = force
    end

    # Every result file recorded against THIS corpus, whatever strategy produced it.
    # Pooling from all of them is the point: a photo only one run ever surfaced is
    # exactly the photo whose judgement decides whether that run was right.
    def self.poolable(results_dir, corpus_sha)
      Pathname(results_dir).glob("*.yml").sort.filter_map do |path|
        doc = YAML.safe_load_file(path)
        next unless doc.is_a?(Hash) && doc["strategy"] && doc["per_query"]
        next unless doc["corpus_sha"] == corpus_sha

        doc.merge("path" => path)
      end
    end

    def call
      raise Incomplete, "no result files to pool from" if results.empty?

      dir.mkpath
      dir.join("README.md").write(instructions)

      queries = set.queries.reject(&:judged?)
      built = queries.map { |query| build(query) }

      {
        queries: built.size,
        skipped: set.queries.size - built.size,
        photos: built.sum { |row| row[:photos] },
        bytes: built.sum { |row| row[:bytes] },
        empty: built.select { |row| row[:photos].zero? }.map { |row| row[:id] },
        sources: results.map { |doc| doc["path"].basename.to_s },
        dir: dir
      }
    end

    # `q07-perro-en-la-playa` — the id first so a folder maps back to queries.yml without
    # reading anything, the query after it so the folder is legible on its own.
    def self.slug(query)
      text = I18n.transliterate(query.query).downcase.gsub(/[^a-z0-9]+/, "-").delete_prefix("-").delete_suffix("-")

      "#{query.id}-#{text[0, 60].delete_suffix("-")}"
    end

    def self.filename_for(path) = path.sub("/", SEPARATOR)

    # The inverse, and the reason the separator is what it is. Returns nil for anything
    # that is not a pooled photo — the README, the query file, a thumbnail database some
    # file manager left behind.
    def self.path_for(filename)
      return nil unless filename.include?(SEPARATOR)

      filename.sub(SEPARATOR, "/")
    end

    private

    def build(query)
      folder = dir.join(self.class.slug(query))
      folder.mkpath
      refuse_to_discard_judging!(folder)

      # Cleared rather than merged. A rebuild after new runs must not leave a photo
      # behind that is no longer in the pool — and if judging has already started, a
      # silent merge would resurrect the photos that were deliberately deleted.
      folder.children.each(&:delete)

      pooled = pool_for(query)
      bytes = 0

      pooled.each do |path|
        source = corpus.dir.join(path)
        next unless source.exist?

        destination = folder.join(self.class.filename_for(path))
        FileUtils.cp(source, destination)
        bytes += destination.size
      end

      folder.join(QUERY_FILE).write(query_file(query, pooled))

      { id: query.id, photos: pooled.size, bytes: bytes }
    end

    # Rebuilding is how the kit follows new runs, and it is also how a morning of judging
    # gets thrown away — the two are the same operation. A folder holding fewer photos
    # than it was built with has been judged, and it is not overwritten without being
    # asked twice.
    def refuse_to_discard_judging!(folder)
      return if force

      pooled = folder.join(QUERY_FILE).file? ? folder.join(QUERY_FILE).read[/^pooled:\s+(\d+)/, 1].to_i : 0
      return if pooled.zero?

      kept = folder.children.count { |child| self.class.path_for(child.basename.to_s) }
      return if kept >= pooled

      raise Incomplete, "#{folder.basename} holds #{kept} of the #{pooled} photos it was " \
                        "built with, so it has been judged. Run `eval:judgements` to read it " \
                        "back first, or pass EVAL_REBUILD=1 to discard it and start over."
    end

    # Union across every run, sorted by path so nothing in the layout hints at rank.
    def pool_for(query)
      results.flat_map { |doc|
        row = doc["per_query"].find { |r| r["id"] == query.id }
        row ? Array(row["ranked"]) : []
      }.uniq.sort
    end

    def query_file(query, pooled)
      <<~TEXT
        #{query.query}

        id:     #{query.id}
        kind:   #{query.kind}
        group:  #{query.group}
        pooled: #{pooled.size} photo(s), from #{results.size} run(s)

        Delete every photo in this folder that is NOT a relevant answer to the query
        above. Keep the ones that are. What remains becomes this query's answer key.

        Leave this file alone; it is ignored when the folder is read back.
      TEXT
    end

    def instructions
      <<~TEXT
        # Judging kit

        One folder per unjudged query, holding every photo any recorded run returned for
        it — the pool. Built #{Date.current.iso8601} from:

        #{results.map { |doc| "- #{doc["path"].basename} (#{doc["strategy"]})" }.join("\n")}

        Nothing here is in git, and nothing here is an original: they are copies, so
        deleting one cannot lose a photo.

        ## How to judge

        In each folder, **delete the photos that are not relevant to the query** and keep
        the ones that are. `_query.txt` holds the query text; leave it alone. Work through
        a whole folder before moving on — a half-judged folder is indistinguishable from
        one where every photo happened to be relevant.

        Relevance is a judgement about the photo, not about the ranking: would you be
        happy to see this photo in the results for that query? Do not think about which
        run returned it — nothing here says, on purpose.

        ## When you are done

            cd gallery-api
            bin/rails eval:judgements              # dry run: shows what it would write
            EVAL_APPLY=1 bin/rails eval:judgements # writes them into eval/queries.yml

        The dry run prints how many photos survived in each folder. A folder where
        nothing was deleted is flagged, because that is what an unjudged folder looks
        like too.

        Then re-run the three strategies against the now-populated answer key, which is
        what finally produces a P@5 that means something:

            EVAL_USER=<email> EVAL_STRATEGY=lexical bin/rails eval:retrieval
            EVAL_USER=<email> EVAL_STRATEGY=semantic bin/rails eval:retrieval   # needs the sidecar
            EVAL_USER=<email> EVAL_STRATEGY=hybrid bin/rails eval:retrieval     # needs the sidecar
      TEXT
    end
  end
end
