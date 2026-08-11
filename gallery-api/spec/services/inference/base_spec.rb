require "rails_helper"

RSpec.describe Inference::Base do
  describe "the chokepoint" do
    # The structural guarantee, asserted structurally. A backend that defines its own
    # #embed_image receives raw user bytes, and the EXIF strip becomes a code review
    # convention instead of a safety property.
    it "is the only definition of #embed_image in app/services/inference" do
      definitions = Rails.root.glob("app/services/inference/**/*.rb").flat_map do |file|
        file.readlines.grep(/^\s*def embed_image\b/).map { [ file.basename.to_s, it.strip ] }
      end

      expect(definitions.map(&:first)).to eq([ "base.rb" ])
    end

    it "routes public embed_image through the private perform_embed_image" do
      backend = Class.new(described_class) do
        def perform_embed_image(io) = "performed:#{io.read}"
      end.new

      expect(backend.embed_image(StringIO.new("bytes"))).to eq("performed:bytes")
    end

    it "raises NotImplementedError when a subclass forgets to implement the hook" do
      expect { Class.new(described_class).new.embed_image(StringIO.new("x")) }
        .to raise_error(NotImplementedError)
    end
  end

  describe "defaults" do
    subject(:backend) { Class.new(described_class).new }

    it "is unavailable, so an unfinished backend cannot claim to work" do
      expect(backend).not_to be_available
    end

    it "raises for the identity readers rather than inventing a model" do
      expect { backend.model_id }.to raise_error(NotImplementedError)
      expect { backend.dimensions }.to raise_error(NotImplementedError)
      expect { backend.embed_text("x") }.to raise_error(NotImplementedError)
    end
  end

  describe Inference::Embedding do
    it "carries the model identity with the vector" do
      embedding = described_class.new(vector: [ 0.1 ], model_id: "m/v1", dimensions: 1)

      expect(embedding.model_id).to eq("m/v1")
      expect(embedding).to be_frozen
    end
  end
end
