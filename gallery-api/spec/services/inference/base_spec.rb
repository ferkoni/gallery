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
        def perform_embed_image(io) = "performed:#{io.read.bytesize}"
      end.new

      expect(backend.embed_image(plain_image)).to start_with("performed:")
    end

    it "raises NotImplementedError when a subclass forgets to implement the hook" do
      expect { Class.new(described_class).new.embed_image(plain_image) }
        .to raise_error(NotImplementedError)
    end
  end

  # The reason the chokepoint exists. Everything above proves there is exactly one
  # entry point; these prove that passing through it removes the data. The backend
  # here is written the way a backend author who has never read the design document
  # would write one — it implements the hook and nothing else — and it still cannot
  # see GPS. That is what makes this a safety property rather than a convention.
  describe "the EXIF guarantee at the boundary" do
    subject(:backend) { capturing_backend }

    let(:captured) { {} }

    let(:capturing_backend) do
      bytes = captured
      Class.new(described_class) do
        define_method(:perform_embed_image) { |io| bytes[:io] = io.read }
      end.new
    end

    def received_image
      Vips::Image.new_from_buffer(captured.fetch(:io), "")
    end

    it "hands the backend bytes with no GPS in them" do
      backend.embed_image(File.open(fixture_file("gps_tagged.jpg"), "rb"))

      expect(received_image.get_fields.grep(/gps/i)).to be_empty
    end

    it "hands the backend bytes with no camera serial in them" do
      backend.embed_image(File.open(fixture_file("gps_tagged.jpg"), "rb"))

      expect(received_image.get_fields.grep(/serial/i)).to be_empty
    end

    it "still hands the backend a usable image, colour profile intact" do
      backend.embed_image(File.open(fixture_file("wide_gamut.jpg"), "rb"))

      expect(received_image.get_fields).to include("icc-profile-data")
    end

    it "hands the backend an upright image, which embeds better than a sideways one" do
      backend.embed_image(File.open(fixture_file("rotated.jpg"), "rb"))

      expect(received_image.height).to be > received_image.width
    end

    # Exif::Strip raises its own error so it stays usable from the upload path.
    # Callers of the adapter should see the inference taxonomy, because 06 branches
    # on it: InvalidInput means discard, never retry.
    it "translates an undecodable image into InvalidInput" do
      expect { backend.embed_image(StringIO.new("not an image")) }
        .to raise_error(Inference::InvalidInput, /not a decodable image/)
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
