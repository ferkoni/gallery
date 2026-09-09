require "rails_helper"
%w[corpus golden_set metrics runner].each { |f| require Rails.root.join("lib/eval/#{f}") }

RSpec.describe Eval::Runner do
  let(:user) { create(:user) }
  let(:album) { create(:album, user: user) }
  let(:corpus) { instance_double(Eval::Corpus, paths: paths, photo_count: paths.size, fingerprint: "sha-1") }
  let(:paths) { [ "pets/gato-teclado.jpg", "pets/gato-balcon.jpg", "wedding/torta.jpg" ] }

  def ingest(*subset)
    (subset.presence || paths).each do |path|
      create(:image, user: user, album: album,
                     title: File.basename(path, ".*"),
                     s3_key: Eval::Ingest.s3_key_for(path))
    end
  end

  def golden_set(queries, corpus_sha: nil)
    Eval::GoldenSet.new(
      "version" => 1, "judged_by" => "Fernando", "corpus_sha" => corpus_sha, "queries" => queries
    )
  end

  def run(set) = described_class.new(set: set, corpus: corpus, user: user, strategy: "lexical").call

  before { require Rails.root.join("lib/eval/ingest") }

  describe "lexical retrieval" do
    it "returns corpus-relative paths, not s3 keys" do
      ingest
      set = golden_set([ { "id" => "q01", "query" => "gato", "kind" => "broad", "relevant" => [] } ])

      expect(run(set)["per_query"].first["ranked"]).to contain_exactly(
        "pets/gato-teclado.jpg", "pets/gato-balcon.jpg"
      )
    end

    it "returns nothing for a multi-word query, because ILIKE matches the whole string" do
      ingest
      set = golden_set([ { "id" => "q01", "query" => "gato en el teclado", "kind" => "descriptive", "relevant" => [] } ])

      expect(run(set)["per_query"].first["returned"]).to eq(0)
    end
  end

  describe "scoring" do
    it "scores a judged query" do
      ingest
      set = golden_set([ { "id" => "q01", "query" => "torta", "kind" => "descriptive",
                           "relevant" => [ "wedding/torta.jpg" ] } ])
      result = run(set)

      expect(result["p_at_5"]).to eq(1.0 / 5)
      expect(result["mrr"]).to eq(1.0)
      expect(result["queries_scored"]).to eq(1)
    end

    # The rule that keeps the headline number honest while 31 of 35 queries are
    # unjudged: an empty answer key is an absence of measurement, not a zero.
    it "excludes unjudged queries from the averages rather than scoring them zero" do
      ingest
      set = golden_set([
        { "id" => "q01", "query" => "torta", "kind" => "descriptive", "relevant" => [ "wedding/torta.jpg" ] },
        { "id" => "q02", "query" => "gato", "kind" => "broad", "relevant" => [] }
      ])
      result = run(set)

      expect(result["queries_scored"]).to eq(1)
      expect(result["p_at_5"]).to eq(1.0 / 5)
      expect(result["per_query"].last["p_at_5"]).to be_nil
    end

    it "reports nil rather than zero when nothing is judged at all" do
      ingest
      set = golden_set([ { "id" => "q01", "query" => "gato", "kind" => "broad", "relevant" => [] } ])
      result = run(set)

      expect(result["p_at_5"]).to be_nil
      expect(result["mrr"]).to be_nil
    end

    # Raw output is what makes a growing answer key survivable: earlier runs get
    # re-scored from it rather than being incomparable.
    it "stores the raw ranking even for unjudged queries" do
      ingest
      set = golden_set([ { "id" => "q01", "query" => "gato", "kind" => "broad", "relevant" => [] } ])

      expect(run(set)["per_query"].first["ranked"]).not_to be_empty
    end
  end

  describe "guards" do
    it "refuses to run when the corpus has changed since judging" do
      ingest
      set = golden_set([ { "id" => "q01", "query" => "gato", "kind" => "broad", "relevant" => [] } ],
                       corpus_sha: "a-different-sha")

      expect { run(set) }.to raise_error(/corpus changed since the golden set was judged/)
    end

    # A stray row is returned by search like any other and scores against P@5, but is
    # not covered by corpus_sha — so the run would measure a corpus nobody can rebuild.
    it "refuses to run when the user owns rows outside the corpus" do
      ingest
      create(:image, user: user, album: album, title: "gato de otra persona", s3_key: "uploads/other.jpg")
      set = golden_set([ { "id" => "q01", "query" => "gato", "kind" => "broad", "relevant" => [] } ])

      expect { run(set) }.to raise_error(/owns 4 image\(s\) but the corpus has 3/)
    end

    it "refuses semantic until the search endpoint from 07 exists" do
      ingest
      set = golden_set([ { "id" => "q01", "query" => "gato", "kind" => "broad", "relevant" => [] } ])
      runner = described_class.new(set: set, corpus: corpus, user: user, strategy: "semantic")

      expect { runner.call }.to raise_error(described_class::UnbuiltStrategy, /not merged/)
    end
  end
end
