require "rails_helper"
require Rails.root.join("spec/support/inference/fake")

RSpec.describe Images::Search do
  let(:user) { create(:user) }
  let(:album) { create(:album, user: user) }
  let(:scope) { Image.with_user(user) }

  def image(title, s3_key: nil)
    create(:image, user: user, album: album, title: title, s3_key: s3_key || "uploads/#{SecureRandom.uuid}/x.jpg")
  end

  # A unit vector pointing mostly along one axis, so "closest to axis n" is decidable
  # without knowing anything about CLIP.
  def vector_towards(axis)
    width = ImageEmbedding.column_dimensions
    raw = Array.new(width, 0.01)
    raw[axis] = 1.0
    norm = Math.sqrt(raw.sum { |x| x * x })
    raw.map { |x| x / norm }
  end

  def embed(image, axis, model_id: "clip-vit-b-32/openai/v1")
    create(:image_embedding, image: image, model_id: model_id, embedding: vector_towards(axis))
  end

  # An adapter that is available and returns a chosen query vector.
  def adapter_returning(axis, model_id: "clip-vit-b-32/openai/v1")
    instance_double(Inference::Local, available?: true, model_id: model_id,
                    embed_text: Inference::Embedding.new(
                      vector: vector_towards(axis), model_id: model_id,
                      dimensions: ImageEmbedding.column_dimensions))
  end

  def search(query) = described_class.call(scope: scope, query: query)

  describe "with inference switched off" do
    before { allow(Inference).to receive(:adapter).and_return(Inference::Null.new) }

    # The regression test that matters most: a self-hosted install that never turns on
    # AI must behave exactly as it did before 07 shipped.
    it "answers from lexical search alone" do
      match = image("gato-teclado")
      image("torta")

      expect(search("gato")).to contain_exactly(match)
    end

    it "returns nothing for a query that matches no title" do
      image("gato-teclado")
      expect(search("un gato en el teclado")).to be_empty
    end

    it "returns nothing for a blank query without calling the adapter" do
      image("gato-teclado")
      expect(search("  ")).to be_empty
    end
  end

  describe "when the sidecar fails mid-request" do
    before do
      adapter = instance_double(Inference::Local, available?: true, model_id: "clip-vit-b-32/openai/v1")
      allow(adapter).to receive(:embed_text).and_raise(Inference::Unavailable, "connection refused")
      allow(Inference).to receive(:adapter).and_return(adapter)
    end

    # A sidecar restarting to load new weights must degrade search to "temporarily
    # less clever", never to a 500.
    it "falls back to lexical rather than raising" do
      match = image("gato-teclado")
      expect { search("gato") }.not_to raise_error
      expect(search("gato")).to contain_exactly(match)
    end
  end

  describe "hybrid retrieval" do
    it "finds a photo whose title says nothing, via its vector" do
      semantic_hit = image("IMG_4471")
      embed(semantic_hit, 0)
      allow(Inference).to receive(:adapter).and_return(adapter_returning(0))

      expect(search("un gato en el teclado")).to include(semantic_hit)
    end

    it "keeps a lexical-only match that semantic never ranked" do
      lexical_hit = image("gato-teclado")   # no embedding at all
      allow(Inference).to receive(:adapter).and_return(adapter_returning(0))

      expect(search("gato")).to include(lexical_hit)
    end

    # RRF's defining property: agreement across strategies beats one strong opinion.
    it "ranks a photo both strategies found above one only semantic found" do
      both = image("gato-teclado")
      semantic_only = image("IMG_0001")
      embed(both, 1)          # slightly further from the query axis
      embed(semantic_only, 0) # nearest neighbour

      allow(Inference).to receive(:adapter).and_return(adapter_returning(0))

      expect(search("gato").to_a).to eq([ both, semantic_only ])
    end

    # Without the model_id filter, vectors from a previous model join in and rank
    # against the current query: plausible results, wrong answers.
    it "ignores embeddings written by a different model" do
      stale = image("IMG_9999")
      embed(stale, 0, model_id: "clip-vit-b-16/laion2b_s34b_b88k/v1")

      allow(Inference).to receive(:adapter).and_return(adapter_returning(0))

      expect(search("un gato")).to be_empty
    end

    it "never returns another user's photos" do
      intruder = create(:image, user: create(:user), title: "gato-ajeno")
      create(:image_embedding, image: intruder, model_id: "clip-vit-b-32/openai/v1",
                               embedding: vector_towards(0))

      allow(Inference).to receive(:adapter).and_return(adapter_returning(0))

      expect(search("gato")).not_to include(intruder)
    end

    it "returns a relation the caller can keep chaining" do
      match = image("gato-teclado")
      embed(match, 0)
      allow(Inference).to receive(:adapter).and_return(adapter_returning(0))

      expect(search("gato").where(favorited: true)).to be_empty
    end
  end

  describe "fusion arithmetic" do
    it "scores agreement above a single first place" do
      fuse = described_class.new(scope: scope, query: "x").send(:fuse, [ 1, 2, 3 ], [ 9, 8, 3 ])
      # 3 is third in both: 2/63 = 0.0317. 1 and 9 are first in one: 1/61 = 0.0164.
      expect(fuse.first).to eq(3)
    end

    it "is deterministic when scores tie" do
      service = described_class.new(scope: scope, query: "x")
      expect(service.send(:fuse, [ 5, 2 ], [])).to eq([ 5, 2 ])
      expect(service.send(:fuse, [ 2 ], [ 5 ])).to eq([ 2, 5 ])
    end
  end
end
