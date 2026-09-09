require "rails_helper"
require Rails.root.join("lib/eval/metrics")

RSpec.describe Eval::Metrics do
  let(:ranked)   { %w[a b c d e f g] }
  let(:relevant) { %w[c f z] }

  describe ".precision_at" do
    it "counts relevant hits among the first k" do
      expect(described_class.precision_at(ranked, relevant, 5)).to eq(1.0 / 5)
    end

    # The property that matters for this eval specifically: the lexical baseline
    # returns nothing for most queries, and a strategy that returns two results and
    # gets both right has filled two of five slots, not achieved a perfect score.
    it "divides by k rather than by the number of results returned" do
      expect(described_class.precision_at(%w[c f], relevant, 5)).to eq(2.0 / 5)
    end

    it "is zero when nothing was returned" do
      expect(described_class.precision_at([], relevant, 5)).to eq(0.0)
    end
  end

  describe ".recall_at" do
    it "measures the fraction of the answer key that surfaced" do
      expect(described_class.recall_at(ranked, relevant, 5)).to eq(1.0 / 3)
    end

    # The cap 08 warns about: this is why recall is reported per-query and never
    # averaged across queries with different relevant-set sizes.
    it "cannot exceed k/|relevant| for a large answer key" do
      big = ("a".."j").to_a
      expect(described_class.recall_at(big, big, 5)).to eq(0.5)
    end

    it "is zero when the answer key is empty" do
      expect(described_class.recall_at(ranked, [], 5)).to eq(0.0)
    end
  end

  describe ".reciprocal_rank" do
    it "is the inverse of the first relevant position" do
      expect(described_class.reciprocal_rank(ranked, relevant)).to eq(1.0 / 3)
    end

    it "is 1.0 when the first result is relevant" do
      expect(described_class.reciprocal_rank(%w[c a b], relevant)).to eq(1.0)
    end

    it "is zero when no relevant result appears" do
      expect(described_class.reciprocal_rank(%w[x y], relevant)).to eq(0.0)
    end
  end

  describe ".mean" do
    it "averages the values it is given" do
      expect(described_class.mean([ 1.0, 0.0 ])).to eq(0.5)
    end

    # nil, not 0.0. An unjudged query is an absence of measurement, and reporting it
    # as zero would label the answer key's emptiness as retrieval quality.
    it "returns nil rather than zero for an empty set" do
      expect(described_class.mean([])).to be_nil
    end
  end
end
