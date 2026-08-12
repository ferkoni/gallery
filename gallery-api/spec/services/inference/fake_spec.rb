require "rails_helper"

# The Fake is test scaffolding, but 06 and 07 will lean on these properties, so they
# are worth pinning down before anything depends on them.
RSpec.describe Inference::Fake do
  subject(:adapter) { described_class.new }

  it "is available, unlike Null" do
    expect(adapter).to be_available
  end

  it "embeds the same text identically every time" do
    expect(adapter.embed_text("beach").vector).to eq(adapter.embed_text("beach").vector)
  end

  it "does not collide on different text" do
    expect(adapter.embed_text("beach").vector).not_to eq(adapter.embed_text("mountain").vector)
  end

  it "returns L2-normalized vectors, as ImageEmbedding will require" do
    norm = Math.sqrt(adapter.embed_text("x").vector.sum { |v| v * v })

    expect(norm).to be_within(1e-9).of(1.0)
  end

  it "produces vectors of the declared width" do
    expect(adapter.embed_text("x").vector.length).to eq(adapter.dimensions)
  end

  it "embeds images through the chokepoint" do
    expect(adapter.embed_image(plain_image).vector.length).to eq(512)
  end
end
