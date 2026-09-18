require "rails_helper"

RSpec.describe Exif::Scrub do
  # Regenerate with: bin/rails exif:fixtures

  def bytes(name) = File.binread(fixture_file(name))

  def scrub(name) = described_class.call(File.open(fixture_file(name), "rb")).read

  # Every page, for the two formats that animate; libvips' other loaders take no `n`.
  def decoded(data)
    loader = Vips::Image.new_from_buffer(data, "").get("vips-loader")
    loader.match?(/gif|webp/) ? Vips::Image.new_from_buffer(data, "", n: -1) : Vips::Image.new_from_buffer(data, "")
  end

  def fields(data) = Vips::Image.new_from_buffer(data, "").get_fields

  # Upright, sRGB with alpha, so a palette GIF and an RGB WebP compare like for like.
  def max_diff(a, b)
    norm = ->(img) { img.autorot.colourspace(:srgb).then { |x| x.bands == 3 ? x.bandjoin(255) : x }.cast(:int) }
    (norm.call(decoded(a)) - norm.call(decoded(b))).abs.max
  end

  # The compressed image data: first SOS to EOI. Byte-identical means never re-encoded.
  def scan(data) = data.byteslice(data.index("\xFF\xDA".b)..data.rindex("\xFF\xD9".b))

  # [marker, payload] for every JPEG segment before the first scan.
  def segments(data)
    pos = 2
    [].tap do |found|
      loop do
        marker = data.getbyte(pos + 1)
        length = data.byteslice(pos + 2, 2).unpack1("n")
        found << [ marker, data.byteslice(pos + 4, length - 2) ]
        break if marker == 0xDA

        pos += 2 + length
      end
    end
  end

  EVERY_FIXTURE = %w[
    gps_tagged.jpg wide_gamut.jpg rotated.jpg plain.jpg hostile.jpg restart.jpg cmyk.jpg
    tagged.png rotated.png lossless.webp animated.webp animated.gif
  ].freeze

  # As in strip_spec: assertions of absence pass vacuously on a fixture that never had the
  # thing, and assertions of fidelity pass vacuously on one with nothing to lose. These run
  # first and prove each fixture is what the examples below take it for.
  describe "the fixtures themselves" do
    it "hostile.jpg carries every kind of JPEG metadata, a thumbnail, and a trailer" do
      data = bytes("hostile.jpg")
      markers = segments(data).map(&:first)

      expect(fields(data)).to include("exif-ifd3-GPSLatitude", "exif-ifd2-BodySerialNumber", "xmp-data", "iptc-data", "icc-profile-data")
      expect(markers).to include(0xE0, 0xE1, 0xED, 0xFE)
      expect(segments(data).assoc(0xE0).last).to end_with("THUMB!")
      expect(data).to end_with("SECRET-TRAILER-AFTER-EOI")
      expect(markers).to include(0xC2) # progressive
      expect(Vips::Image.new_from_buffer(data, "").get("orientation")).to eq(6)
    end

    it "restart.jpg is progressive with restart markers in its scans" do
      data = bytes("restart.jpg")

      expect(segments(data).map(&:first)).to include(0xC2, 0xDD)
      expect(scan(data).b).to match(/\xFF[\xD0-\xD7]/n)
    end

    it "cmyk.jpg is CMYK and carries the Adobe segment" do
      expect(Vips::Image.new_from_buffer(bytes("cmyk.jpg"), "").interpretation).to eq(:cmyk)
      expect(segments(bytes("cmyk.jpg")).assoc(0xEE).last).to start_with("Adobe")
    end

    it "tagged.png is a palette PNG with EXIF, XMP and a profile" do
      data = bytes("tagged.png")

      expect(data).to include("PLTE", "eXIf", "tEXt", "iCCP", "SECRET-XMP")
      expect(fields(data)).to include("exif-ifd3-GPSLatitude")
    end

    it "rotated.png carries orientation 6" do
      expect(Vips::Image.new_from_buffer(bytes("rotated.png"), "").get("orientation")).to eq(6)
    end

    it "lossless.webp is lossless and carries EXIF, XMP and a profile" do
      expect(bytes("lossless.webp")).to include("VP8L", "EXIF", "XMP ", "ICCP", "SECRET-XMP")
    end

    it "the animations have two frames, and the GIF its loop, comment and XMP" do
      expect(decoded(bytes("animated.webp")).get("n-pages")).to eq(2)
      expect(bytes("animated.webp")).to include("EXIF")

      gif = bytes("animated.gif")
      expect(decoded(gif).get("n-pages")).to eq(2)
      expect(gif).to include("NETSCAPE2.0", "XMP DataXMP", "SECRET-COMMENT")
    end
  end

  describe "what it keeps: the photo" do
    # Compared upright, since rotated.png is rotated (losslessly); everything else is copied.
    EVERY_FIXTURE.each do |name|
      it "decodes #{name} to exactly the pixels it was given" do
        expect(max_diff(bytes(name), scrub(name))).to eq(0)
      end
    end

    # Stronger than identical pixels: the compressed data is the uploaded file's own bytes.
    it "copies every JPEG's compressed data byte for byte" do
      %w[gps_tagged.jpg hostile.jpg restart.jpg cmyk.jpg rotated.jpg].each do |name|
        expect(scan(scrub(name))).to eq(scan(bytes(name))), "#{name} was re-encoded"
      end
    end

    it "keeps both frames of an animation" do
      expect(decoded(scrub("animated.gif")).get("n-pages")).to eq(2)
      expect(decoded(scrub("animated.webp")).get("n-pages")).to eq(2)
    end

    it "keeps a lossless WebP lossless" do
      expect(scrub("lossless.webp")).to include("VP8L")
    end

    it "keeps a palette PNG a palette PNG, so it does not grow" do
      expect(scrub("tagged.png")).to include("PLTE")
      expect(scrub("tagged.png").bytesize).to be < bytes("tagged.png").bytesize
    end
  end

  describe "what it keeps: the rest" do
    it "preserves the ICC profile byte for byte" do
      %w[hostile.jpg wide_gamut.jpg tagged.png lossless.webp].each do |name|
        original = Vips::Image.new_from_buffer(bytes(name), "").get("icc-profile-data")

        expect(Vips::Image.new_from_buffer(scrub(name), "").get("icc-profile-data")).to eq(original), name
      end
    end

    it "keeps the Adobe segment that tells a decoder how CMYK is stored" do
      expect(segments(scrub("cmyk.jpg")).assoc(0xEE)).to eq(segments(bytes("cmyk.jpg")).assoc(0xEE))
    end

    it "keeps a GIF's loop count" do
      expect(scrub("animated.gif")).to include("NETSCAPE2.0")
    end
  end

  describe "orientation" do
    it "keeps a JPEG's orientation as a one-entry EXIF, and nothing else from it" do
      out = scrub("hostile.jpg")
      app1 = segments(out).select { |marker, _| marker == 0xE1 }

      expect(app1.size).to eq(1)
      expect(app1.first.last.bytesize).to eq(32) # the 36-byte segment, less marker and length
      expect(Vips::Image.new_from_buffer(out, "").get("orientation")).to eq(6)
    end

    it "leaves a rotated JPEG's pixels as they were, for the viewer to turn" do
      out = Vips::Image.new_from_buffer(scrub("rotated.jpg"), "")

      expect(out.width).to be > out.height
      expect(out.autorot.height).to be > out.autorot.width
    end

    it "writes no EXIF at all for a JPEG that needs no turning" do
      expect(segments(scrub("gps_tagged.jpg")).map(&:first)).not_to include(0xE1)
    end

    # The one path that decodes, and it saves losslessly (docs: lossless-exif-strip/02, decision 5).
    it "rotates a PNG carrying an orientation, losslessly, and drops the tag" do
      out = Vips::Image.new_from_buffer(scrub("rotated.png"), "")

      expect(out.height).to be > out.width
      expect(out.get_fields).not_to include("orientation")
      expect(max_diff(bytes("rotated.png"), scrub("rotated.png"))).to eq(0)
    end
  end

  # On the raw bytes as well as on what libvips reports: libvips invents default EXIF fields
  # on load (XResolution and the like), so a field list alone misleads in both directions.
  describe "what it removes" do
    it "removes GPS, the serial, the device and XMP from every format that carries them" do
      %w[hostile.jpg tagged.png lossless.webp animated.webp].each do |name|
        out = scrub(name)

        expect(fields(out).grep(/gps|serial|make|xmp|iptc/i)).to be_empty, name
        expect(out).not_to include("SECRET"), name
      end
    end

    it "drops every JPEG segment off the allowlist, and the bytes after EOI" do
      out = scrub("hostile.jpg")

      expect(segments(out).map(&:first)).not_to include(0xED, 0xFE)
      expect(out).not_to include("http://ns.adobe.com", "Photoshop 3.0", "SECRET")
      expect(out).to end_with("\xFF\xD9".b)
    end

    it "keeps JFIF but not the thumbnail it carried" do
      jfif = segments(scrub("hostile.jpg")).assoc(0xE0).last

      expect(jfif.bytesize).to eq(14)
      expect(jfif.byteslice(12, 2)).to eq("\x00\x00".b)
      expect(scrub("hostile.jpg")).not_to include("THUMB!")
    end

    it "drops a PNG's EXIF and text chunks" do
      expect(scrub("tagged.png")).not_to include("eXIf", "tEXt")
    end

    it "drops a WebP's EXIF and XMP chunks and clears the flags that announce them" do
      out = scrub("lossless.webp")

      expect(out).not_to include("EXIF", "XMP ")
      expect(out.getbyte(20) & 0x0C).to eq(0) # VP8X flags, first byte after its header
      expect(out.byteslice(4, 4).unpack1("V")).to eq(out.bytesize - 8)
    end

    it "drops a GIF's comment and XMP extensions" do
      expect(scrub("animated.gif")).not_to include("XMP DataXMP", "SECRET")
    end
  end

  describe "the IO contract" do
    it "returns a StringIO positioned at the start" do
      expect(described_class.call(plain_image)).to be_a(StringIO).and have_attributes(pos: 0)
    end

    it "rewinds the input, so the caller can still read what it passed in" do
      io = plain_image
      described_class.call(io)

      expect(io.read).to eq(plain_image_bytes)
    end

    it "scrubs an IO that has already been read to the end" do
      io = File.open(fixture_file("hostile.jpg"), "rb")
      io.read

      expect(described_class.call(io).read).not_to include("SECRET")
    end
  end

  describe "bad input" do
    def attempt(data) = described_class.call(StringIO.new(data))

    it "refuses bytes that are not an image, a corrupt header, and a JPEG cut short" do
      half = bytes("hostile.jpg").byteslice(0, bytes("hostile.jpg").bytesize / 2)

      [ "not an image", bytes("corrupt.jpg"), half ].each do |data|
        expect { attempt(data) }.to raise_error(described_class::UndecodableImage)
      end
    end

    it "refuses a PNG whose chunk runs past the end" do
      data = bytes("tagged.png")
      iend = data.index("IEND") - 4
      broken = data.byteslice(0, iend) + [ 1_000 ].pack("N") + "IDAT"

      expect { attempt(broken) }.to raise_error(described_class::UndecodableImage, /well-formed/)
    end

    it "refuses a GIF with a block it does not recognise" do
      gif = bytes("animated.gif")
      broken = gif.byteslice(0, gif.rindex(";")) + "\x99;".b

      expect { attempt(broken) }.to raise_error(described_class::UndecodableImage)
    end

    it "raises only its own error, never Vips::Error or the parser's" do
      expect { attempt("not an image") }.to raise_error(described_class::UndecodableImage)
      expect(described_class::UndecodableImage.ancestors).not_to include(Vips::Error, Exif::Containers::Malformed)
    end
  end
end
