module Exif
  module Containers
    # Keeps the RIFF chunks that make up the image and drops EXIF and XMP, clearing the
    # VP8X flags that announce them and recomputing the RIFF size (decision 3). A simple
    # WebP (no VP8X) has nowhere to keep metadata and comes back unchanged.
    class Webp
      KEEP = [ "VP8X", "ICCP", "ANIM", "ANMF", "ALPH", "VP8 ", "VP8L" ].freeze
      METADATA_FLAGS = 0x08 | 0x04 # EXIF, XMP

      def self.call(bytes, orientation: 1) = new(bytes).call

      def initialize(bytes)
        @bytes = bytes
      end

      def call
        raise Malformed, "not a WebP" unless @bytes.byteslice(0, 4) == "RIFF" && @bytes.byteslice(8, 4) == "WEBP"

        riff_end = 8 + @bytes.byteslice(4, 4).unpack1("V")
        raise Malformed, "truncated RIFF" if riff_end > @bytes.bytesize

        body = +"WEBP".b
        pos = 12
        while pos < riff_end
          raise Malformed, "truncated chunk" if pos + 8 > riff_end

          fourcc, size = @bytes.byteslice(pos, 8).unpack("a4V")
          padded = size + (size & 1) # chunks are padded to an even length
          raise Malformed, "truncated chunk" if pos + 8 + size > riff_end

          if KEEP.include?(fourcc)
            chunk = @bytes.byteslice(pos, 8 + padded)
            chunk.setbyte(8, chunk.getbyte(8) & ~METADATA_FLAGS) if fourcc == "VP8X"
            body << chunk
          end
          pos += 8 + padded
        end

        "RIFF".b + [ body.bytesize ].pack("V") + body
      end
    end
  end
end
