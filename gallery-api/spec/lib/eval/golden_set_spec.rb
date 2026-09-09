require "rails_helper"
require Rails.root.join("lib/eval/corpus")
require Rails.root.join("lib/eval/golden_set")

RSpec.describe Eval::GoldenSet do
  def doc(queries:, **overrides)
    { "version" => 1, "judged_by" => "Fernando", "judged_at" => nil,
      "corpus_sha" => nil, "queries" => queries }.merge(overrides.transform_keys(&:to_s))
  end

  def query(id: "q01", query: "ramo de flores", kind: "descriptive", relevant: [])
    { "id" => id, "query" => query, "kind" => kind, "relevant" => relevant }
  end

  describe "validation" do
    it "loads a well-formed set" do
      set = described_class.new(doc(queries: [ query ]))
      expect(set.queries.size).to eq(1)
    end

    it "rejects an empty set" do
      expect { described_class.new(doc(queries: [])) }.to raise_error(described_class::Invalid, /no queries/)
    end

    it "rejects duplicate ids" do
      queries = [ query(id: "q01"), query(id: "q01", query: "otra cosa") ]
      expect { described_class.new(doc(queries:)) }.to raise_error(described_class::Invalid, /duplicate query ids/)
    end

    # The same string scored twice is one measurement counted twice, dragging the
    # average toward whatever that query happens to do.
    it "rejects duplicate query text regardless of case" do
      queries = [ query(id: "q01", query: "urbanismo sin naturaleza"),
                  query(id: "q02", query: "Urbanismo Sin Naturaleza") ]
      expect { described_class.new(doc(queries:)) }.to raise_error(described_class::Invalid, /duplicate query text/)
    end

    it "rejects a blank query" do
      expect { described_class.new(doc(queries: [ query(query: "  ") ])) }
        .to raise_error(described_class::Invalid, /blank query text/)
    end

    it "rejects an unknown kind" do
      expect { described_class.new(doc(queries: [ query(kind: "vibes") ])) }
        .to raise_error(described_class::Invalid, /unknown kind/)
    end
  end

  describe "#judged" do
    it "counts only queries carrying a relevance judgement" do
      set = described_class.new(doc(queries: [
        query(id: "q01"), query(id: "q02", query: "gato", relevant: [ "pets/gato-teclado.jpg" ])
      ]))
      expect(set.judged.map(&:id)).to eq([ "q02" ])
      expect(set.unjudged.map(&:id)).to eq([ "q01" ])
    end
  end

  describe "#warnings" do
    # `lexical` relevance is pre-filled by construction — the query IS the filename —
    # so it is not evidence that a judging pass happened.
    it "flags judged_at when only lexical queries carry judgements" do
      set = described_class.new(doc(
        judged_at: "2026-09-09",
        queries: [ query(id: "q01"),
                   query(id: "q30", query: "DSC_0014", kind: "lexical",
                         relevant: [ "buildings/DSC_0014.JPG" ]) ]
      ))
      expect(set.warnings.join).to match(/answer key is empty/)
    end

    it "does not flag judged_at once a real judgement exists" do
      set = described_class.new(doc(
        judged_at: "2026-09-09",
        queries: [ query(relevant: [ "pets/gato-teclado.jpg" ]) ]
      ))
      expect(set.warnings.join).not_to match(/answer key is empty/)
    end

    it "flags a blank judge" do
      set = described_class.new(doc(judged_by: nil, queries: [ query ]))
      expect(set.warnings.join).to match(/judged_by is blank/)
    end

    it "flags answer-key paths that are not in the corpus" do
      corpus = instance_double(Eval::Corpus, paths: [ "pets/gato-teclado.jpg" ])
      set = described_class.new(doc(queries: [ query(relevant: [ "pets/no-such-photo.jpg" ]) ]))
      expect(set.warnings(corpus:).join).to match(/not in the corpus/)
    end
  end
end
