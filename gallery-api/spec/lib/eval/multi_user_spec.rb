require "rails_helper"
%w[corpus ingest golden_set metrics multi_user].each { |f| require Rails.root.join("lib/eval/#{f}") }

# The multi-user recall case, run against synthetic vectors instead of the corpus.
#
# `rake eval:multi_user` is the version that produces a committed result file, and it
# needs 235 private photos, their embeddings, and a running sidecar — none of which CI
# has. What CI can have is the part that is actually a correctness claim: that a second
# user with 5% of the library gets the same results an exact scan would give, and that
# this harness would notice if an index took them away.
#
# The vectors here are arbitrary. The trap is a property of the index and the filter,
# not of what the photos depict.
RSpec.describe Eval::MultiUser do
  let(:model_id) { "clip-vit-b-32/openai/v1" }
  let(:width) { ImageEmbedding.column_dimensions }
  let(:owner) { create(:user) }
  let(:album) { create(:album, user: owner) }

  # 200 rows is far below where anyone would reach for HNSW, and comfortably above
  # ef_search = 40 — which is all the trap needs: 40 candidates fetched globally, of
  # which one user's 5% share is two.
  let(:corpus_size) { 200 }
  let(:minority_share) { corpus_size / described_class::MINORITY_EVERY }

  # A unit vector in a random direction. Random rather than clustered on purpose: an
  # index whose graph is one tight cluster returns the same neighbours for every query
  # and would hide the effect being measured.
  def unit_vector(rng)
    raw = Array.new(width) { rng.rand(-0.5..0.5) }
    norm = Math.sqrt(raw.sum { |x| x * x })
    raw.map { |x| x / norm }
  end

  before do
    rng = Random.new(20260910) # fixed, so a failure here is reproducible

    corpus_size.times do |n|
      image = create(:image, user: owner, album: album,
                             title: "photo-#{n}",
                             s3_key: Eval::Ingest.s3_key_for("pets/photo-#{n}.jpg"))
      create(:image_embedding, image: image, model_id: model_id, embedding: unit_vector(rng))
    end
  end

  let(:corpus) do
    instance_double(Eval::Corpus, photo_count: corpus_size, fingerprint: "sha-1",
                                  paths: Array.new(corpus_size) { |n| "pets/photo-#{n}.jpg" })
  end

  let(:set) do
    Eval::GoldenSet.new(
      "version" => 1, "judged_by" => "spec",
      "queries" => [ { "id" => "q01", "query" => "gato", "kind" => "broad", "relevant" => [] } ]
    )
  end

  # Available, and returning one fixed query vector — the same one for every regime, so
  # any difference between regimes is the index and nothing else.
  let(:adapter) do
    vector = unit_vector(Random.new(1))
    instance_double(Inference::Local, available?: true, model_id: model_id,
                    embed_text: Inference::Embedding.new(vector: vector, model_id: model_id, dimensions: width))
  end

  # Stubbed as well as injected: the product path runs through Images::Search, which
  # reaches for Inference.adapter itself — as it should, since deciding that is the
  # service's job and not a caller's.
  before { allow(Inference).to receive(:adapter).and_return(adapter) }

  # No padding: the spec's own 200 rows are the table.
  subject(:result) do
    described_class.new(user: owner, corpus: corpus, set: set, pad: 0, adapter: adapter).call
  end

  it "gives the minority user 5% of the corpus, spread across it" do
    expect(result["split"]).to include("minority_photos" => minority_share, "majority_photos" => corpus_size - minority_share)
  end

  # The claim the case exists to make.
  it "answers the minority user identically to exact search under every regime" do
    described_class::REGIMES.each do |regime|
      expect(result["product_path"][regime]).to include(
        "queries_identical_to_exact" => 1, "mean_recall_vs_exact" => 1.0
      ), "product path diverged from exact search under #{regime}"
    end
  end

  # And the reason to believe it: the same corpus, the same split and the same index,
  # with the query shape changed to one the planner will answer from the index, loses
  # most of the minority user's results. A check that cannot fail is decoration.
  it "loses the minority user's results when the query is answered from the index" do
    forced = result["forced_ann"]["hnsw"]

    expect(forced["index_scan"]).to be(true)
    expect(forced["mean_recall_vs_exact"]).to be < 0.5
    expect(forced["queries_short_of_k"]).to eq(1)
  end

  # pgvector >= 0.8's iterative scan, which is what makes an index survivable here if
  # one is ever added — and the reason the compose file pins the image it does.
  #
  # `>=` rather than `== 1.0`: relaxed_order resumes the scan, it does not turn the
  # index into an exact one, and the full 35-query run against the real corpus does
  # leave one query a place short. 04's table says "mostly", and this asserts mostly.
  it "restores them with hnsw.iterative_scan" do
    expect(result["forced_ann"]["hnsw_iterative"]["mean_recall_vs_exact"]).to be >= 0.9
  end

  # Every regime rebuilds and drops its own index, and the whole run is one transaction
  # that is rolled back — so a run leaves the schema exactly as it found it. This is the
  # check that a crashed or half-finished run cannot quietly leave an index behind that
  # every later eval would then be measuring.
  it "leaves nothing behind" do
    expect { result }.not_to change { Image.count + ImageEmbedding.count + User.count }

    indexes = ActiveRecord::Base.connection.indexes("image_embeddings").map(&:name)
    expect(indexes).not_to include(described_class::INDEX_NAME)
  end
end
