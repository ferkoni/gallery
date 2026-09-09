require "rails_helper"
require Rails.root.join("lib/eval/corpus")

RSpec.describe Eval::Corpus do
  around do |example|
    Dir.mktmpdir do |dir|
      @dir = Pathname.new(dir)
      example.run
    end
  end

  def write(path, content)
    file = @dir.join(path)
    file.dirname.mkpath
    file.write(content)
  end

  subject(:corpus) { described_class.new(@dir) }

  it "lists group-relative paths in sorted order" do
    write("wedding/b.jpg", "b")
    write("pets/a.jpg", "a")
    expect(corpus.paths).to eq([ "pets/a.jpg", "wedding/b.jpg" ])
    expect(corpus.photo_count).to eq(2)
  end

  it "is stable across runs" do
    write("pets/a.jpg", "a")
    expect(corpus.fingerprint).to eq(described_class.new(@dir).fingerprint)
  end

  # The property the whole fingerprint exists for. `title` defaults to the filename
  # minus its extension and lexical search is `title ILIKE`, so a rename changes what
  # the baseline can find while every pixel stays identical. A content-only hash would
  # call this the same corpus and silently invalidate every earlier measurement.
  it "changes when a file is renamed, even though the bytes are untouched" do
    write("pets/a.jpg", "same bytes")
    before = corpus.fingerprint

    @dir.join("pets/a.jpg").rename(@dir.join("pets/cat.jpg"))
    expect(described_class.new(@dir).fingerprint).not_to eq(before)
  end

  it "changes when a file's content changes" do
    write("pets/a.jpg", "one")
    before = corpus.fingerprint

    write("pets/a.jpg", "two")
    expect(described_class.new(@dir).fingerprint).not_to eq(before)
  end

  describe "#duplicate_content" do
    # Two identical images are two rows with identical vectors: they retrieve together
    # forever, and after a disambiguating rename they carry different titles, so lexical
    # matches one and semantic matches both.
    it "finds byte-identical files across groups" do
      write("tourism/x.jpg", "identical")
      write("buildings/y.jpg", "identical")
      write("pets/z.jpg", "different")

      expect(corpus.duplicate_content).to contain_exactly([ "buildings/y.jpg", "tourism/x.jpg" ])
    end

    it "is empty for a clean corpus" do
      write("pets/a.jpg", "a")
      write("pets/b.jpg", "b")
      expect(corpus.duplicate_content).to be_empty
    end
  end

  describe "#duplicate_basenames" do
    it "finds one filename used in two groups" do
      write("tourism/IMG_1.jpg", "one")
      write("garden/IMG_1.jpg", "two")
      expect(corpus.duplicate_basenames).to contain_exactly([ "garden/IMG_1.jpg", "tourism/IMG_1.jpg" ])
    end
  end
end
