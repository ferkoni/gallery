require "rails_helper"

RSpec.describe Inference::Null do
  subject(:adapter) { described_class.new }

  it "reports itself unavailable so callers fall back to lexical search" do
    expect(adapter).not_to be_available
  end

  it "raises rather than returning a zero vector for text" do
    expect { adapter.embed_text("x") }.to raise_error(Inference::Disabled)
  end

  it "raises rather than returning a zero vector for an image" do
    expect { adapter.embed_image(StringIO.new("bytes")) }.to raise_error(Inference::Disabled)
  end

  # A zero vector would save, index cleanly, and rank arbitrarily forever. This is
  # the assertion that the failure is loud rather than silent.
  it "never returns an Embedding" do
    expect { adapter.embed_text("x") }.to raise_error(Inference::Error)
  end

  it "reports zero dimensions, claiming no vector space" do
    expect(adapter.dimensions).to eq(0)
  end

  # Callers must go through the chokepoint, not around it.
  it "keeps perform_embed_image private" do
    expect(adapter.respond_to?(:perform_embed_image)).to be(false)
  end
end
