module Exif
  # Removes metadata from a photo without re-encoding it: what Images::Upload stores.
  #
  # Exif::Strip decodes and re-encodes, which is right for pixels that go to inference and
  # wrong for the photo a user keeps: it stored every JPEG at libvips' default Q=75, turned
  # lossless WebP lossy, and kept only the first frame of an animation. This walks the
  # file's own blocks instead and copies the image data byte for byte
  # (docs: lossless-exif-strip/02, decisions 1 and 2).
  #
  # Keeps the ICC profile, as Strip does. Keeps a JPEG's orientation as the one tag left
  # rather than rotating the pixels, since rotating means re-encoding (decision 4).
  #
  # Returns a rewound StringIO, and leaves the input rewound.
  class Scrub
    class UndecodableImage < StandardError; end

    # By libvips loader, which is how Strip#suffix_for matches formats too.
    CONTAINERS = {
      "jpegload" => Containers::Jpeg,
      "pngload" => Containers::Png,
      "webpload" => Containers::Webp,
      "gifload" => Containers::Gif
    }.freeze

    # The one path that decodes: a still PNG or WebP carrying an orientation. Rare, since
    # cameras write neither, and saved losslessly so nothing more is lost (decision 5).
    ROTATE_LOSSLESSLY = { "pngload" => ".png", "webpload" => ".webp[lossless]" }.freeze

    def self.call(io) = new(io).call

    def initialize(io)
      @io = io
    end

    def call
      @io.rewind if @io.respond_to?(:rewind)
      bytes = @io.read.b

      # Lazy: reads the header, not the pixels. The full decode happens once, in
      # Images::Thumbnail, which fails the upload if it cannot (decision 7).
      header = Vips::Image.new_from_buffer(bytes, "")
      loader = header.get("vips-loader").to_s.sub(/_buffer\z/, "")
      container = CONTAINERS.fetch(loader) { raise UndecodableImage, "unsupported image format: #{loader}" }
      orientation = field(header, "orientation", 1).then { |o| (2..8).cover?(o) ? o : 1 }

      if orientation != 1 && ROTATE_LOSSLESSLY.key?(loader) && field(header, "n-pages", 1) == 1
        # Through the container too, so everything stored passes the same allowlist,
        # whichever path produced it.
        bytes = header.autorot.write_to_buffer(ROTATE_LOSSLESSLY[loader], keep: Strip::KEEP)
        orientation = 1
      end

      # Only a JPEG keeps its orientation as a tag. An animated PNG or WebP loses it and
      # keeps its frames (decision 5).
      StringIO.new(container.call(bytes, orientation: loader == "jpegload" ? orientation : 1))
    rescue Vips::Error => e
      raise UndecodableImage, "not a decodable image: #{e.message}"
    rescue Containers::Malformed => e
      raise UndecodableImage, "not a well-formed image: #{e.message}"
    ensure
      @io.rewind if @io.respond_to?(:rewind)
    end

    private

    def field(image, name, default) = image.get_fields.include?(name) ? image.get(name) : default
  end
end
