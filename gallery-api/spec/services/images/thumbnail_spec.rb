require "rails_helper"

RSpec.describe Images::Thumbnail do
  # Built in memory rather than committed: the size cases need originals larger than
  # the box, and the committed fixtures are all smaller than it on purpose.
  def jpeg(width, height) = StringIO.new(Vips::Image.black(width, height, bands: 3).write_to_buffer(".jpg"))

  def decoded(io) = Vips::Image.new_from_buffer(io.read, "")

  describe ".generate" do
    it "crops a landscape original to exactly SIZE on both edges" do
      thumbnail = decoded(described_class.generate(jpeg(1200, 800)))

      expect([ thumbnail.width, thumbnail.height ]).to eq([ described_class::SIZE, described_class::SIZE ])
    end

    it "crops a portrait original to exactly SIZE on both edges" do
      thumbnail = decoded(described_class.generate(jpeg(800, 1200)))

      expect([ thumbnail.width, thumbnail.height ]).to eq([ described_class::SIZE, described_class::SIZE ])
    end

    it "writes WebP whatever the original's format" do
      thumbnail = decoded(described_class.generate(jpeg(1200, 800)))

      expect(thumbnail.get("vips-loader")).to start_with("webpload")
    end

    it "never upscales an original smaller than the box" do
      thumbnail = decoded(described_class.generate(plain_image))

      expect([ thumbnail.width, thumbnail.height ]).to eq([ 32, 32 ])
    end

    # The fixture has to be proven to carry GPS first, or the assertion below passes
    # vacuously — including with the implementation deleted.
    it "carries no GPS, serial or timestamp, from an original that has all three" do
      original = File.open(fixture_file("gps_tagged.jpg"), "rb")
      expect(Vips::Image.new_from_file(fixture_file("gps_tagged.jpg").to_s).get_fields)
        .to include("exif-ifd3-GPSLatitude")

      fields = decoded(described_class.generate(original)).get_fields

      expect(fields.grep(/gps|serial|datetime/i)).to be_empty
    end

    it "keeps the colour profile, so a wide-gamut photo's tile matches its lightbox" do
      thumbnail = decoded(described_class.generate(File.open(fixture_file("wide_gamut.jpg"), "rb")))

      expect(thumbnail.get_fields).to include("icc-profile-data")
    end

    it "applies the EXIF orientation, so a portrait photo's tile is not sideways" do
      # Landscape pixels tagged "rotate 90°"; see Exif::Strip's spec for the fixture.
      thumbnail = decoded(described_class.generate(File.open(fixture_file("rotated.jpg"), "rb")))

      expect(thumbnail.height).to be > thumbnail.width
    end

    it "raises GenerationFailed, not Vips::Error, for bytes it cannot decode" do
      expect { described_class.generate(File.open(fixture_file("corrupt.jpg"), "rb")) }
        .to raise_error(described_class::GenerationFailed)
    end

    it "rewinds the IO it was given, so the caller can still upload those bytes" do
      io = jpeg(1200, 800)
      described_class.generate(io)

      expect(io.pos).to eq(0)
    end
  end

  describe ".key_for" do
    it "puts the thumbnail beside its original, marked .thumb.webp" do
      expect(described_class.key_for("albums/2/uuid/beach.jpg")).to eq("albums/2/uuid/beach.thumb.webp")
    end

    # The collision this naming exists to prevent: with the extension merely swapped,
    # a WebP original and its thumbnail would share a key, and the thumbnail PUT would
    # overwrite the user's photo.
    %w[
      albums/2/uuid/beach.jpg
      albums/2/uuid/beach.png
      albums/2/uuid/beach.gif
      albums/2/uuid/beach.webp
      albums/2/uuid/beach
      albums/2/uuid/beach.thumb.webp
      albums/2/uuid/.webp
    ].each do |s3_key|
      it "never equals the original's own key (#{s3_key})" do
        expect(described_class.key_for(s3_key)).not_to eq(s3_key)
      end
    end

    it "does not contain the size, so regenerating at a new size overwrites in place" do
      expect(described_class.key_for("albums/2/uuid/beach.jpg")).not_to include(described_class::SIZE.to_s)
    end
  end
end
