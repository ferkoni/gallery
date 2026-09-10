require "rails_helper"
require Rails.root.join("spec/support/inference/fake")

RSpec.describe Inference::QueryEmbedding do
  let(:adapter) { Inference::Fake.new }

  # The test environment uses a null_store, which would make every caching assertion
  # below pass for the wrong reason.
  around do |example|
    original = Rails.cache
    Rails.cache = ActiveSupport::Cache::MemoryStore.new
    example.run
  ensure
    Rails.cache = original
  end

  around do |example|
    original = Inference.config.prompt_template
    example.run
  ensure
    Inference.config.prompt_template = original
  end

  def embed(query) = described_class.for(query, adapter: adapter)

  it "returns the query's vector" do
    expect(embed("un gato")).to eq(adapter.embed_text("un gato").vector)
  end

  describe "the prompt template" do
    it "sends the bare query when no template is configured" do
      Inference.config.prompt_template = nil
      expect(described_class.new("un gato", adapter: adapter).templated).to eq("un gato")
    end

    it "substitutes {query}" do
      Inference.config.prompt_template = "una foto de {query}"
      expect(described_class.new("un gato", adapter: adapter).templated).to eq("una foto de un gato")
    end

    it "changes the resulting vector" do
      Inference.config.prompt_template = nil
      bare = embed("un gato")

      Inference.config.prompt_template = "una foto de {query}"
      expect(embed("un gato")).not_to eq(bare)
    end
  end

  describe "caching" do
    it "embeds a repeated query only once" do
      expect(adapter).to receive(:embed_text).once.and_call_original

      2.times { embed("un gato") }
    end

    it "embeds different queries separately" do
      expect(adapter).to receive(:embed_text).twice.and_call_original

      embed("un gato")
      embed("una boda")
    end

    # The failure this prevents is silent: without the template in the key, changing
    # the wording keeps answering from vectors built with the old one.
    it "does not serve a cached vector across a template change" do
      Inference.config.prompt_template = nil
      bare = embed("un gato")

      Inference.config.prompt_template = "una foto de {query}"
      expect(embed("un gato")).not_to eq(bare)
    end

    it "does not serve a cached vector across a model change" do
      first = embed("un gato")
      other = Inference::Fake.new
      allow(other).to receive(:model_id).and_return("clip-vit-b-16/laion2b_s34b_b88k/v1")
      allow(other).to receive(:embed_text).and_return(
        Inference::Embedding.new(vector: Array.new(Inference::Fake::DIMENSIONS, 0.0),
                                 model_id: "clip-vit-b-16/laion2b_s34b_b88k/v1",
                                 dimensions: Inference::Fake::DIMENSIONS))

      expect(described_class.for("un gato", adapter: other)).not_to eq(first)
    end
  end
end
