module Eval
  # Reads a judged kit back: what survived in each folder becomes that query's
  # `relevant:` list in queries.yml.
  #
  # The write is textual, line by line, and touches nothing but the `relevant:` blocks it
  # was asked to change. Round-tripping the file through YAML.dump would be shorter and
  # would destroy every comment in it — and queries.yml is mostly comments, because the
  # rules about how to write a query are worth more than the queries.
  class Judgements
    class Invalid < StandardError; end

    attr_reader :set, :corpus, :dir

    def initialize(set:, corpus:, dir: Corpus.root.join("judging"))
      @set = set
      @corpus = corpus
      @dir = Pathname(dir)
    end

    # One row per folder found. Reports rather than decides: whether a folder with
    # nothing deleted means "all relevant" or "not judged yet" is not knowable from here,
    # so it is flagged and left to the person who did the judging.
    def read
      raise Invalid, "no judging kit at #{dir}" unless dir.directory?

      set.queries.filter_map do |query|
        folder = dir.join(JudgingKit.slug(query))
        next unless folder.directory?

        kept = kept_paths(folder)
        pooled = pooled_count(folder)

        {
          id: query.id,
          query: query.query,
          folder: folder.basename.to_s,
          pooled: pooled,
          kept: kept.size,
          relevant: kept,
          # The two shapes worth a second look before any of this is written down.
          untouched: pooled.positive? && kept.size == pooled,
          empty: kept.empty?
        }
      end
    end

    # Rewrites `relevant:` for the given rows, and stamps judged_at. Everything else in
    # the file — comments, order, spacing, the queries themselves — comes through
    # unchanged, which is checkable with `git diff` and is the point.
    def apply(rows, path: Corpus.root.join("queries.yml"), judged_on: Date.current)
      source = Pathname(path)
      by_id = rows.to_h { |row| [ row[:id], row[:relevant] ] }
      lines = source.read.lines

      output = []
      index = 0
      current = nil

      while index < lines.size
        line = lines[index]

        # `  - id: q07` opens a query block; the id decides whether the `relevant:` key
        # below belongs to a query being rewritten or one being left alone.
        current = Regexp.last_match(1) if line =~ /^\s*-\s+id:\s*(\S+)/

        # Dropped and re-emitted rather than left alone, so the marker tracks the folder:
        # a query that gains a judgement on a later pass loses it again.
        if line =~ /^\s+judged:\s/ && by_id.key?(current)
          index += 1
          next
        end

        if line =~ /^(\s*)relevant:/ && by_id.key?(current)
          indent = Regexp.last_match(1)
          relevant = by_id.fetch(current)

          # "Judged, and nothing was relevant" said out loud. Without it an empty list
          # reads as *unjudged*, and the query the retriever did worst on silently leaves
          # the average — flattering the result by dropping its hardest case.
          output << "#{indent}judged: true\n" if relevant.empty?
          output << render(indent, relevant)
          index = skip_existing_list(lines, index + 1, indent)
          next
        end

        output << (line =~ /^judged_at:/ ? stamp(line, judged_on) : line)
        index += 1
      end

      source.write(output.join)
      by_id.size
    end

    private

    # Only files that map back to a corpus path count. A folder also holds `_query.txt`,
    # and a file manager may have left a thumbnail cache in it; neither is a judgement.
    def kept_paths(folder)
      folder.children.filter_map { |child|
        next unless child.file?

        path = JudgingKit.path_for(child.basename.to_s)
        next unless path && corpus.paths.include?(path)

        path
      }.sort
    end

    def pooled_count(folder)
      file = folder.join(JudgingKit::QUERY_FILE)
      return 0 unless file.file?

      file.read[/^pooled:\s+(\d+)/, 1].to_i
    end

    def render(indent, paths)
      return "#{indent}relevant: []\n" if paths.empty?

      # Quoted, always. Corpus filenames are whatever a camera or a person produced —
      # `family/AyK (278 de 715).jpg` is already in there — and a plain YAML scalar reads
      # several ordinary filename characters as syntax: ` #` starts a comment, a leading
      # `*` or `&` is an alias, `: ` is a mapping. Quoting retires the whole class rather
      # than the members of it anyone thought of.
      paths.map { |path| "#{indent}  - #{path.to_json}\n" }.unshift("#{indent}relevant:\n").join
    end

    # Walks past whatever the old value was — `[]` on the same line is already gone with
    # the key, a block list follows underneath it.
    #
    # Only items indented DEEPER than the key. `- id: q02` is also a list item beginning
    # with whitespace, so a looser test eats the next query whenever two entries are not
    # separated by a blank line — which they always are in this file, right up until
    # somebody deletes one.
    def skip_existing_list(lines, index, indent)
      index += 1 while index < lines.size &&
                       lines[index] =~ /^(\s+)-\s/ && Regexp.last_match(1).length > indent.length
      index
    end

    def stamp(line, judged_on)
      comment = line[/(\s*#.*)$/, 1]

      "judged_at: \"#{judged_on.iso8601}\"#{comment}\n"
    end
  end
end
