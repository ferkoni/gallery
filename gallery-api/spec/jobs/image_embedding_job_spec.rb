require "rails_helper"

# Runs entirely against Inference::Fake — no GPU, no Python, no sidecar, no network.
# That is the seam from 02 earning its keep: every behaviour below is testable in CI
# on a machine that could not run CLIP if it wanted to.
#
# The bytes are real JPEGs from spec/fixtures/files rather than a string, because the
# path under test runs through Exif::Strip on its way to the backend (02) — feeding it
# "fake-jpeg-bytes" would exercise the undecodable branch on every single example.
RSpec.describe ImageEmbeddingJob, type: :job do
  let(:user) { create(:user) }
  let(:album) { create(:album, user: user) }
  let!(:credential) { create(:s3_credential, user: user) }
  let(:image) { create(:image, user: user, album: album) }

  let(:adapter) { Inference::Fake.new }
  let(:storage) { instance_double(S3::Storage) }
  let(:model_id) { adapter.model_id }

  def fixture_bytes(name) = Rails.root.join("spec/fixtures/files", name).binread

  before do
    allow(Inference).to receive(:adapter).and_return(adapter)
    allow(S3::Storage).to receive(:for).and_return(storage)
    allow(storage).to receive(:stream_object).and_yield(fixture_bytes("plain.jpg"))
  end

  it "writes one embedding carrying the identity from the response" do
    described_class.perform_now([ image.id ], model_id: model_id)

    embedding = ImageEmbedding.sole
    expect(embedding.image).to eq(image)
    expect(embedding.model_id).to eq(model_id)
    expect(embedding.dimensions).to eq(512)
    expect(embedding.embedding.size).to eq(512)
  end

  it "is idempotent — re-running does not double-embed" do
    2.times { described_class.perform_now([ image.id ], model_id: model_id) }

    expect(ImageEmbedding.where(image: image).count).to eq(1)
  end

  it "skips images already embedded for this model without fetching bytes" do
    described_class.perform_now([ image.id ], model_id: model_id)
    # The selection happens before any S3 read, so a re-run costs nothing at all —
    # not merely "is safe". That is the difference the needing_embedding filter buys.
    expect(storage).to have_received(:stream_object).once

    described_class.perform_now([ image.id ], model_id: model_id)
    expect(storage).to have_received(:stream_object).once
  end

  it "re-embeds for a different model rather than considering the image done" do
    create(:image_embedding, image: image, model_id: "clip-other/openai/v1")

    described_class.perform_now([ image.id ], model_id: model_id)

    expect(ImageEmbedding.where(image: image).pluck(:model_id))
      .to contain_exactly("clip-other/openai/v1", model_id)
  end

  it "does nothing when inference is unavailable" do
    allow(adapter).to receive(:available?).and_return(false)

    described_class.perform_now([ image.id ], model_id: model_id)

    expect(ImageEmbedding.count).to eq(0)
  end

  describe "a corrupt file" do
    # Not stubbed: corrupt.jpg genuinely fails to decode, so this exercises the real
    # Exif::Strip → InvalidInput translation the adapter performs (02) rather than a
    # test's opinion of what that path does.
    before do
      allow(storage).to receive(:stream_object)
        .with(image.s3_key).and_yield(fixture_bytes("corrupt.jpg"))
    end

    it "is skipped rather than retried — it would fail identically forever" do
      expect { described_class.perform_now([ image.id ], model_id: model_id) }
        .not_to raise_error

      expect(ImageEmbedding.count).to eq(0)
    end

    it "does not take the rest of the batch down with it" do
      # The reason there is no class-level `discard_on Inference::InvalidInput`: it
      # would throw away every image in the job because one file was broken.
      healthy = create(:image, user: user, album: album)
      allow(storage).to receive(:stream_object)
        .with(healthy.s3_key).and_yield(fixture_bytes("plain.jpg"))

      described_class.perform_now([ image.id, healthy.id ], model_id: model_id)

      expect(ImageEmbedding.pluck(:image_id)).to eq([ healthy.id ])
    end
  end

  it "skips users with no S3 credentials rather than raising" do
    # S3::Storage.for returns nil by design for a user with no credentials. There is
    # no bucket for the bytes to be in, so there is nothing to embed and nothing wrong.
    allow(S3::Storage).to receive(:for).and_return(nil)

    expect { described_class.perform_now([ image.id ], model_id: model_id) }
      .not_to raise_error

    expect(ImageEmbedding.count).to eq(0)
  end

  it "builds one storage gateway per user, not one per image" do
    other_user = create(:user)
    create(:s3_credential, user: other_user)
    other_album = create(:album, user: other_user)
    mine = create_list(:image, 2, user: user, album: album)
    theirs = create(:image, user: other_user, album: other_album)

    described_class.perform_now((mine + [ theirs ]).map(&:id), model_id: model_id)

    expect(S3::Storage).to have_received(:for).twice
  end

  it "runs on the inference queue" do
    # Asserted because the queue name is what keeps this off the pool album downloads
    # share, and it is a one-word edit away from being wrong.
    expect(described_class.new.queue_name).to eq("inference")
  end

  it "retries a sidecar that is merely down" do
    # Unavailable is the one class where repeating the identical request is right:
    # nothing about the request was wrong, the sidecar was just not there yet.
    expect(described_class.rescue_handlers.map(&:first))
      .to include("Inference::Unavailable")
  end
end
