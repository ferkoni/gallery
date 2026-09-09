require "rails_helper"
%w[corpus ingest embed].each { |f| require Rails.root.join("lib/eval/#{f}") }

RSpec.describe Eval::Embed do
  let(:user) { create(:user) }
  let(:album) { create(:album, user: user) }
  let(:adapter) { Inference::Fake.new }
  let(:paths) { [ "pets/gato-teclado.jpg", "wedding/torta.jpg" ] }

  around do |example|
    Dir.mktmpdir do |dir|
      @dir = Pathname.new(dir)
      paths.each do |path|
        file = @dir.join(path)
        file.dirname.mkpath
        file.binwrite(png_bytes(path))
      end
      example.run
    end
  end

  # Real bytes, because the adapter runs Exif::Strip over them before the backend sees
  # anything — a fixture that is not a decodable image would exercise the error path
  # rather than the happy one.
  def png_bytes(seed)
    require "vips"
    Vips::Image.black(4, 4).add(seed.bytesize).cast(:uchar).bandjoin([ 0, 0 ]).pngsave_buffer
  end

  let(:corpus) { Eval::Corpus.new(@dir) }

  def ingest(*subset)
    (subset.presence || paths).each do |path|
      create(:image, user: user, album: album,
                     title: File.basename(path, ".*"),
                     s3_key: Eval::Ingest.s3_key_for(path))
    end
  end

  subject(:embed) { described_class.new(user: user, corpus: corpus, adapter: adapter, io: StringIO.new) }

  it "writes one embedding per corpus image, carrying the model's own identity" do
    ingest
    counts = embed.call

    expect(counts).to include(embedded: 2, skipped: 0, missing: 0, total: 2)
    expect(ImageEmbedding.count).to eq(2)
    expect(ImageEmbedding.distinct.pluck(:model_id)).to eq([ adapter.model_id ])
    expect(ImageEmbedding.distinct.pluck(:dimensions)).to eq([ Inference::Fake::DIMENSIONS ])
  end

  # Which images still need embedding is derived from the absence of a row, never
  # stored — so a second run is free rather than merely safe.
  it "does nothing on a second run" do
    ingest
    embed.call

    expect { described_class.new(user: user, corpus: corpus, adapter: adapter, io: StringIO.new).call }
      .not_to change(ImageEmbedding, :count)
  end

  it "embeds only what is missing after a partial run" do
    ingest
    embed.call
    ImageEmbedding.first.destroy!

    counts = described_class.new(user: user, corpus: corpus, adapter: adapter, io: StringIO.new).call
    expect(counts).to include(embedded: 1, total: 1)
  end

  it "leaves another user's images alone" do
    ingest
    other = create(:image, user: create(:user), s3_key: Eval::Ingest.s3_key_for("pets/gato-teclado.jpg") + "-other")

    embed.call
    expect(ImageEmbedding.where(image: other)).to be_empty
  end

  # A row whose key does not carry the eval prefix is not a corpus row, and resolving
  # it would build a path outside the corpus directory.
  it "reports a row with no file on disk instead of raising" do
    create(:image, user: user, album: album, title: "ghost",
                   s3_key: Eval::Ingest.s3_key_for("pets/not-on-disk.jpg"))

    counts = embed.call
    expect(counts).to include(embedded: 0, missing: 1)
  end

  it "skips a row that is not a corpus row at all" do
    create(:image, user: user, album: album, title: "not-eval", s3_key: "uploads/uuid/photo.jpg")

    counts = embed.call
    expect(counts).to include(embedded: 0, missing: 1)
  end

  it "skips undecodable bytes rather than failing the run" do
    ingest
    @dir.join(paths.first).binwrite("not an image")

    counts = embed.call
    expect(counts).to include(embedded: 1, skipped: 1)
  end
end
