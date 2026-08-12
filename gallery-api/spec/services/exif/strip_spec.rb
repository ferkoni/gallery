require "rails_helper"

RSpec.describe Exif::Strip do
  # Regenerate with: bin/rails exif:fixtures
  def fixture(name) = Rails.root.join("spec/fixtures/files", name)

  def strip(name) = described_class.call(File.open(fixture(name), "rb"))

  def stripped_image(name) = Vips::Image.new_from_buffer(strip(name).read, "")

  # This whole file asserts the ABSENCE of data, which is the easiest kind of test to
  # write vacuously: strip a fixture that never had GPS, assert it has no GPS, pass
  # forever — including with the implementation deleted. These two examples are what
  # stop that, so they run first and everything below is meaningless without them.
  describe "the fixtures themselves" do
    it "gps_tagged.jpg really does carry GPS, a serial, a timestamp and a device" do
      fields = Vips::Image.new_from_file(fixture("gps_tagged.jpg").to_s).get_fields

      expect(fields).to include("exif-ifd3-GPSLatitude", "exif-ifd3-GPSLongitude")
      expect(fields.grep(/serial/i)).not_to be_empty
      expect(fields.grep(/datetime/i)).not_to be_empty
      expect(fields).to include("exif-ifd0-Make", "exif-ifd0-Model")

      # And a colour profile alongside them, like a real phone photo, so this one
      # fixture can prove the two are treated differently.
      expect(fields).to include("icc-profile-data")
    end

    it "wide_gamut.jpg really does carry a non-sRGB profile to lose" do
      image = Vips::Image.new_from_file(fixture("wide_gamut.jpg").to_s)

      expect(image.get_fields).to include("icc-profile-data")
      expect(image.get("icc-profile-data").bytesize).to be > 0
    end

    it "rotated.jpg really is landscape pixels tagged as portrait" do
      image = Vips::Image.new_from_file(fixture("rotated.jpg").to_s)

      expect(image.width).to be > image.height
      expect(image.get("orientation")).to eq(6)
    end
  end

  describe "what it removes" do
    it "removes GPS coordinates" do
      expect(stripped_image("gps_tagged.jpg").get_fields.grep(/gps/i)).to be_empty
    end

    it "removes camera serial numbers" do
      expect(stripped_image("gps_tagged.jpg").get_fields.grep(/serial/i)).to be_empty
    end

    it "removes the capture timestamp and the device identity" do
      fields = stripped_image("gps_tagged.jpg").get_fields

      expect(fields.grep(/datetime|make|model/i)).to be_empty
    end

    # The three examples above can only assert against fields somebody thought to name.
    # This one asserts against the container: the entire APP1 segment is gone, so
    # anything that was in it is gone, including tags nobody here has heard of and the
    # embedded thumbnail — which is a full copy of the original image and is the one
    # payload that cannot be fixtured with libvips alone.
    it "removes the entire APP1 EXIF segment, not merely the fields under test" do
      before = File.binread(fixture("gps_tagged.jpg"))
      after = strip("gps_tagged.jpg").read

      expect(before).to include("Exif\x00\x00".b)
      expect(after).not_to include("Exif\x00\x00".b)
    end
  end

  describe "what it keeps" do
    # A blanket strip takes the colour profile with it and wide-gamut photos then
    # render as sRGB: visibly duller, with no error anywhere to trace it to. Comparing
    # the profile bytes rather than merely asserting the field exists also catches a
    # strip that replaces the profile with a default one.
    it "preserves the ICC profile byte for byte" do
      original = Vips::Image.new_from_file(fixture("wide_gamut.jpg").to_s)

      expect(stripped_image("wide_gamut.jpg").get("icc-profile-data"))
        .to eq(original.get("icc-profile-data"))
    end

    it "keeps the ICC segment in the output bytes" do
      expect(strip("wide_gamut.jpg").read).to include("ICC_PROFILE".b)
    end

    # The two guarantees in one file, which is the shape of a real photo: the EXIF
    # goes, the profile stays. A blanket strip would fail the second half here and
    # nowhere else, because it is the only fixture carrying both.
    it "drops the EXIF and keeps the profile from the same photo" do
      out = stripped_image("gps_tagged.jpg")

      expect(out.get_fields.grep(/exif|gps/i)).to be_empty
      expect(out.get_fields).to include("icc-profile-data")
    end

    # Orientation must be applied, not dropped. Dropped, a portrait photo comes out
    # sideways — and embeds worse, since CLIP has no rotation invariance.
    it "bakes orientation into the pixels rather than discarding the tag" do
      out = stripped_image("rotated.jpg")

      expect(out.height).to be > out.width
      expect(out.get_fields.grep(/exif/i)).to be_empty
    end

    it "returns the same format it was given" do
      %w[.png .webp .gif].each do |suffix|
        source = Vips::Image.new_from_file(fixture("plain.jpg").to_s)
                            .write_to_buffer(suffix)

        out = described_class.call(StringIO.new(source)).read

        expect(Vips::Image.new_from_buffer(out, "").get("vips-loader"))
          .to eq(Vips::Image.new_from_buffer(source, "").get("vips-loader"))
      end
    end
  end

  describe "the IO contract" do
    it "returns a StringIO positioned at the start" do
      expect(strip("plain.jpg")).to be_a(StringIO).and have_attributes(pos: 0)
    end

    it "rewinds the input, so the caller can still read what it passed in" do
      io = File.open(fixture("plain.jpg"), "rb")
      described_class.call(io)

      expect(io.read).to eq(File.binread(fixture("plain.jpg")))
    end

    it "strips an IO that has already been read to the end" do
      io = File.open(fixture("gps_tagged.jpg"), "rb")
      io.read

      out = Vips::Image.new_from_buffer(described_class.call(io).read, "")

      expect(out.get_fields.grep(/gps/i)).to be_empty
    end
  end

  describe "bad input" do
    it "raises UndecodableImage rather than a Vips::Error" do
      expect { described_class.call(StringIO.new("not an image")) }
        .to raise_error(described_class::UndecodableImage, /not a decodable image/)
    end

    # The error deliberately does not come from the Inference namespace: the upload
    # path (03-upload-path) reuses this service and has nothing to do with AI.
    it "raises an error that does not belong to the inference taxonomy" do
      expect(described_class::UndecodableImage.ancestors).not_to include(Inference::Error)
    end
  end
end
