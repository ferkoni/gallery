module Exif
  # Removes EXIF (GPS, camera serials, timestamps, the embedded thumbnail) while
  # preserving the ICC colour profile, and bakes display orientation into the pixels
  # before the tag that described it is dropped.
  #
  # Returns a rewound StringIO in the same format it was given.
  #
  # For pixels that leave the app for inference, which need orientation applied and do not
  # need fidelity: the output is re-encoded at libvips' defaults. What a user keeps goes
  # through Exif::Scrub instead, which never re-encodes (docs: lossless-exif-strip/02,
  # decision 1).
  class Strip
    # Raised when the bytes are not a decodable image.
    #
    # Deliberately NOT Inference::InvalidInput, which is what the design document
    # proposed. Inference::Base translates this into its own taxonomy at the point
    # where it becomes an inference concern, which is what keeps Exif ignorant of
    # Inference.
    class UndecodableImage < StandardError; end

    # What to retain. Everything not named here — the whole EXIF IFD including GPS,
    # plus XMP and IPTC — is dropped.
    #
    # Note this is `:icc`, a plain symbol, and not `Vips::ForeignKeep[:icc]`: that
    # constant does not exist in ruby-vips 2.3.0. See the issue log.
    KEEP = :icc

    # libvips names its loaders after the format, which is how the output format is
    # matched to the input. These are exactly Images::Upload::ALLOWED_TYPES.
    SUFFIXES = {
      "jpegload" => ".jpg",
      "pngload" => ".png",
      "webpload" => ".webp",
      "gifload" => ".gif"
    }.freeze

    def self.call(io) = new(io).call

    def initialize(io)
      @io = io
    end

    def call
      @io.rewind if @io.respond_to?(:rewind)
      bytes = @io.read

      # autorot bakes the EXIF rotation into the pixels and clears the tag. Order
      # matters: strip first and a portrait photo comes out sideways, because the
      # tag saying "rotate this" is gone while the sideways pixels remain. It also
      # costs embedding quality — CLIP has no rotation invariance to speak of.
      image = Vips::Image.new_from_buffer(bytes, "").autorot

      StringIO.new(image.write_to_buffer(suffix_for(image), keep: KEEP))
    rescue Vips::Error => e
      raise UndecodableImage, "not a decodable image: #{e.message}"
    ensure
      @io.rewind if @io.respond_to?(:rewind)
    end

    private

    # Raises rather than defaulting to JPEG for an unrecognized format. The adapter can
    # be handed bytes of any kind, which is exactly why this should not guess: a default
    # would quietly re-encode, say, a TIFF, and hide that it was ever given one.
    def suffix_for(image)
      loader = image.get("vips-loader").to_s.sub(/_buffer\z/, "")
      SUFFIXES.fetch(loader) { raise UndecodableImage, "unsupported image format: #{loader}" }
    rescue Vips::Error => e
      raise UndecodableImage, "could not determine image format: #{e.message}"
    end
  end
end
