require "rails_helper"
%w[corpus golden_set judging_kit judgements].each { |f| require Rails.root.join("lib/eval/#{f}") }

# The judging round trip: result files → folders of photos → back into queries.yml.
#
# Nothing here needs a database, a sidecar or the real corpus. It needs files, because
# every way this can go wrong is a file-handling mistake — a name that does not survive
# the round trip, a rebuild that eats a morning of judging, a rewrite that reformats a
# file full of comments.
RSpec.describe Eval::JudgingKit do
  let(:root) { Pathname(Dir.mktmpdir) }
  let(:corpus_dir) { root.join("corpus") }
  let(:kit_dir) { root.join("judging") }

  let(:paths) do
    [ "pets/gato-teclado.jpg", "pets/gato balcon (2).jpg", "wedding/torta.jpg", "garden/rosas.jpg" ]
  end

  let(:corpus) do
    paths.each do |path|
      file = corpus_dir.join(path)
      file.dirname.mkpath
      file.write("not really a jpeg, but it is #{path}")
    end

    instance_double(Eval::Corpus, dir: corpus_dir, paths: paths, fingerprint: "sha-1")
  end

  let(:set) do
    Eval::GoldenSet.new(
      "version" => 1, "judged_by" => "spec",
      "queries" => [
        { "id" => "q01", "query" => "gato en el teclado", "kind" => "descriptive", "relevant" => [] },
        { "id" => "q02", "query" => "torta", "kind" => "broad", "relevant" => [] },
        # Already judged, so the kit has nothing to ask about it.
        { "id" => "q03", "query" => "rosas.jpg", "kind" => "lexical", "relevant" => [ "garden/rosas.jpg" ] }
      ]
    )
  end

  # Two runs that disagree, which is the case pooling exists for: `garden/rosas.jpg` was
  # found by one of them only, and its judgement is what decides whether that run was right.
  let(:results) do
    [
      { "strategy" => "semantic", "corpus_sha" => "sha-1", "path" => Pathname("a-semantic.yml"),
        "per_query" => [ { "id" => "q01", "ranked" => [ "pets/gato-teclado.jpg", "pets/gato balcon (2).jpg" ] },
                         { "id" => "q02", "ranked" => [ "wedding/torta.jpg" ] } ] },
      { "strategy" => "lexical", "corpus_sha" => "sha-1", "path" => Pathname("b-lexical.yml"),
        "per_query" => [ { "id" => "q01", "ranked" => [ "pets/gato-teclado.jpg", "garden/rosas.jpg" ] },
                         { "id" => "q02", "ranked" => [] } ] }
    ]
  end

  def build(force: false)
    described_class.new(corpus: corpus, set: set, results: results, dir: kit_dir, force: force).call
  end

  after { FileUtils.remove_entry(root) }

  describe "building the kit" do
    it "makes one folder per unjudged query, named for the query" do
      build

      expect(kit_dir.children.map { |c| c.basename.to_s }).to contain_exactly(
        "README.md", "q01-gato-en-el-teclado", "q02-torta"
      )
    end

    it "pools the union of every run, not just one" do
      summary = build

      kept = kit_dir.join("q01-gato-en-el-teclado").children.map { |c| c.basename.to_s }
      expect(kept).to include("pets__gato-teclado.jpg", "garden__rosas.jpg")
      # Two runs returned `gato-teclado`; it is one photo and gets copied once.
      expect(summary[:photos]).to eq(4)
    end

    it "copies rather than moves, so judging cannot lose a photo" do
      build

      expect(corpus_dir.join("pets/gato-teclado.jpg")).to exist
      expect(kit_dir.join("q01-gato-en-el-teclado/pets__gato-teclado.jpg").read)
        .to eq(corpus_dir.join("pets/gato-teclado.jpg").read)
    end

    it "survives filenames with spaces and parentheses" do
      build

      expect(kit_dir.join("q01-gato-en-el-teclado/pets__gato balcon (2).jpg")).to exist
      expect(described_class.path_for("pets__gato balcon (2).jpg")).to eq("pets/gato balcon (2).jpg")
    end

    it "reports the queries no run answered, because an empty pool cannot be judged" do
      results.each { |doc| doc["per_query"].reject! { |row| row["id"] == "q02" } }

      expect(build[:empty]).to eq([ "q02" ])
    end
  end

  # Rebuilding is how the kit picks up a new run, and it is the same operation that would
  # throw away an afternoon's judging.
  describe "rebuilding" do
    it "is fine while nothing has been judged" do
      build
      expect { build }.not_to raise_error
    end

    it "refuses once a folder has been judged" do
      build
      kit_dir.join("q01-gato-en-el-teclado/garden__rosas.jpg").delete

      expect { build }.to raise_error(described_class::Incomplete, /has been judged/)
    end

    it "discards it when asked twice" do
      build
      kit_dir.join("q01-gato-en-el-teclado/garden__rosas.jpg").delete

      build(force: true)
      expect(kit_dir.join("q01-gato-en-el-teclado/garden__rosas.jpg")).to exist
    end
  end

  describe Eval::Judgements do
    subject(:judgements) { described_class.new(set: set, corpus: corpus, dir: kit_dir) }

    before { Eval::JudgingKit.new(corpus: corpus, set: set, results: results, dir: kit_dir).call }

    def judge(folder, keep:)
      kit_dir.join(folder).children.each do |child|
        next if child.basename.to_s == Eval::JudgingKit::QUERY_FILE

        child.delete unless keep.include?(child.basename.to_s)
      end
    end

    it "reads what survived as the answer key" do
      judge("q01-gato-en-el-teclado", keep: [ "pets__gato-teclado.jpg" ])

      row = judgements.read.find { |r| r[:id] == "q01" }
      expect(row[:relevant]).to eq([ "pets/gato-teclado.jpg" ])
      expect(row[:kept]).to eq(1)
      expect(row[:pooled]).to eq(3)
    end

    it "ignores the query file and anything else a file manager leaves behind" do
      judge("q02-torta", keep: [ "wedding__torta.jpg" ])
      kit_dir.join("q02-torta/.directory").write("[Dolphin]")

      expect(judgements.read.find { |r| r[:id] == "q02" }[:relevant]).to eq([ "wedding/torta.jpg" ])
    end

    # The two cases a person has to resolve, because the folder cannot.
    it "flags a folder nothing was deleted from, which is what unjudged looks like" do
      expect(judgements.read.find { |r| r[:id] == "q01" }[:untouched]).to be(true)
    end

    it "flags a folder nothing survived in" do
      judge("q02-torta", keep: [])

      row = judgements.read.find { |r| r[:id] == "q02" }
      expect(row[:empty]).to be(true)
      expect(row[:untouched]).to be(false)
    end
  end

  describe "writing back into queries.yml" do
    let(:queries_file) { root.join("queries.yml") }

    let(:original) do
      <<~YAML
        # The header comment, which is most of this file and the reason the rewrite is
        # textual rather than a YAML round trip.
        version: 1
        judged_by: "Fernando"
        judged_at: ""          # YYYY-MM-DD of the judging pass

        queries:

          # a section comment
          - id: q01
            query: "gato en el teclado"
            kind: descriptive
            relevant: []

          - id: q02
            query: "torta"
            kind: broad
            relevant: []

          - id: q03
            query: "rosas.jpg"
            kind: lexical
            relevant:
              - garden/rosas.jpg
      YAML
    end

    subject(:judgements) { Eval::Judgements.new(set: set, corpus: corpus, dir: kit_dir) }

    before { queries_file.write(original) }

    def apply(rows) = judgements.apply(rows, path: queries_file, judged_on: Date.new(2026, 9, 11))

    it "writes the answer key and leaves every comment in place" do
      apply([ { id: "q01", relevant: [ "pets/gato-teclado.jpg", "pets/gato balcon (2).jpg" ] } ])

      expect(queries_file.read).to include(<<~YAML.indent(2))
        - id: q01
          query: "gato en el teclado"
          kind: descriptive
          relevant:
            - "pets/gato-teclado.jpg"
            - "pets/gato balcon (2).jpg"
      YAML
      expect(queries_file.read).to include("# The header comment", "# a section comment")
    end

    it "leaves queries it was not given alone, including ones already judged" do
      apply([ { id: "q01", relevant: [ "pets/gato-teclado.jpg" ] } ])

      expect(queries_file.read).to include("  - id: q02\n    query: \"torta\"\n    kind: broad\n    relevant: []\n")
      expect(queries_file.read).to include("    relevant:\n      - garden/rosas.jpg\n")
    end

    it "replaces an existing list rather than appending to it" do
      apply([ { id: "q03", relevant: [ "wedding/torta.jpg" ] } ])

      expect(queries_file.read).to include("    relevant:\n      - \"wedding/torta.jpg\"\n")
      expect(queries_file.read).not_to include("garden/rosas.jpg")
    end

    # The next query's `- id:` is a list item beginning with whitespace too, and it is
    # only a blank line away from the list being replaced.
    it "stops at the next query when no blank line separates them" do
      queries_file.write(original.sub("      - garden/rosas.jpg\n", "      - garden/rosas.jpg\n  - id: q04\n    query: \"perro\"\n    kind: broad\n    relevant: []\n"))

      apply([ { id: "q03", relevant: [ "wedding/torta.jpg" ] } ])

      expect(queries_file.read).to include("  - id: q04\n    query: \"perro\"\n")
    end

    it "writes an empty key as `[]`, which this harness reads as unjudged" do
      apply([ { id: "q01", relevant: [] } ])

      expect(queries_file.read).to include("    relevant: []\n")
    end

    it "stamps judged_at without eating the comment beside it" do
      apply([ { id: "q01", relevant: [ "pets/gato-teclado.jpg" ] } ])

      expect(queries_file.read).to include('judged_at: "2026-09-11"          # YYYY-MM-DD of the judging pass')
    end

    # The whole point of the textual rewrite: the file still parses, and it parses to what
    # was intended rather than to something that merely looks right.
    it "produces a file the golden set can still load" do
      apply([ { id: "q01", relevant: [ "pets/gato balcon (2).jpg" ] } ])

      reloaded = Eval::GoldenSet.load(queries_file)
      expect(reloaded.queries.find { |q| q.id == "q01" }.relevant).to eq([ "pets/gato balcon (2).jpg" ])
      expect(reloaded.judged_at).to eq("2026-09-11")
      expect(reloaded.queries.size).to eq(3)
    end
  end
end
