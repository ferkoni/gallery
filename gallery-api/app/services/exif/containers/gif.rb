module Exif
  module Containers
    # Keeps a GIF's frames, colour tables, timing and loop count, and drops its comments and
    # every application extension that is not the loop or the colour profile (decision 3).
    class Gif
      TRAILER = 0x3B
      IMAGE = 0x2C
      EXTENSION = 0x21
      GRAPHIC_CONTROL = 0xF9
      APPLICATION = 0xFF
      APPLICATIONS = [ "NETSCAPE2.0", "ANIMEXTS1.0", "ICCRGBG1012" ].freeze

      def self.call(bytes, orientation: 1) = new(bytes).call

      def initialize(bytes)
        @bytes = bytes
      end

      def call
        raise Malformed, "not a GIF" unless @bytes.start_with?("GIF87a", "GIF89a")

        header = 13 + colour_table_size(@bytes.getbyte(10) || 0)
        raise Malformed, "truncated header" if header > @bytes.bytesize

        out = @bytes.byteslice(0, header)
        pos = header
        loop do
          case @bytes.getbyte(pos)
          when TRAILER then return out << TRAILER.chr # anything after it is dropped
          when IMAGE
            start = pos
            packed = @bytes.getbyte(pos + 9) or raise Malformed, "truncated image"
            pos = skip_sub_blocks(pos + 10 + colour_table_size(packed) + 1) # + LZW minimum code size
            out << @bytes.byteslice(start, pos - start)
          when EXTENSION
            start = pos
            label = @bytes.getbyte(pos + 1)
            kept = label == GRAPHIC_CONTROL ||
                   (label == APPLICATION && APPLICATIONS.include?(@bytes.byteslice(pos + 3, 11)))
            pos = skip_sub_blocks(pos + 2)
            out << @bytes.byteslice(start, pos - start) if kept
          else
            raise Malformed, "unexpected block"
          end
        end
      end

      private

      def colour_table_size(packed) = packed & 0x80 == 0 ? 0 : 3 * (2 << (packed & 0x07))

      def skip_sub_blocks(pos)
        loop do
          size = @bytes.getbyte(pos) or raise Malformed, "truncated data"
          pos += 1 + size
          return pos if size.zero?
        end
      end
    end
  end
end
