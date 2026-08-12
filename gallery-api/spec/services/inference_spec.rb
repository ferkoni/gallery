require "rails_helper"

RSpec.describe Inference do
  # The initializer sets real config at boot; these specs drive it directly and put
  # it back afterwards so ordering cannot leak a mode into an unrelated spec.
  around do |example|
    previous = described_class.config.to_h
    example.run
    described_class.configure { |c| previous.each { |k, v| c[k] = v } }
  end

  def configure(mode:, **rest)
    described_class.configure do |c|
      c.mode = mode
      c.endpoint = rest[:endpoint]
      c.timeout = rest.fetch(:timeout, 10)
    end
  end

  describe ".adapter" do
    it "defaults to Null, so a fresh install is a gallery rather than an AI product" do
      configure(mode: :none)

      expect(described_class.adapter).to be_a(Inference::Null)
      expect(described_class.adapter).not_to be_available
    end

    it "memoizes, so callers share one adapter" do
      configure(mode: :none)

      expect(described_class.adapter).to equal(described_class.adapter)
    end

    it "rebuilds after reconfiguration rather than serving a stale adapter" do
      configure(mode: :none)
      first = described_class.adapter
      configure(mode: :local, endpoint: "http://sidecar:8000")

      expect(described_class.adapter).not_to equal(first)
      expect(described_class.adapter).to be_a(Inference::Local)
    end
  end

  describe "validation" do
    # A silent fallback to Null means an operator who typos this gets a working app
    # with no AI, no error, and an evening of confusion.
    it "raises on an unknown mode, naming the typo and the valid modes" do
      expect { configure(mode: :lokal) }
        .to raise_error(ArgumentError, /unknown INFERENCE_MODE: :lokal.*none, local/m)
    end

    # :remote is designed but unbuilt. Booting into it and exploding on the first
    # embed call hours later is the same silent-misconfiguration failure.
    it "distinguishes a designed-but-unbuilt mode from a typo" do
      expect { configure(mode: :remote) }
        .to raise_error(ArgumentError, /designed but not built/)
    end

    it "raises during configure, not lazily on first use" do
      expect { configure(mode: :nope) }.to raise_error(ArgumentError)
    end

    it "requires an endpoint for local, since a sidecar URL cannot be guessed" do
      expect { configure(mode: :local, endpoint: nil) && described_class.adapter }
        .to raise_error(ArgumentError, /INFERENCE_ENDPOINT/)
    end
  end
end
