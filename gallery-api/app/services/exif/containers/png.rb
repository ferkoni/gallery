module Exif
  module Containers
    # Keeps the PNG chunks that affect how the image looks and drops every other one, which
    # is where PNG keeps metadata: eXIf, tEXt, zTXt, iTXt (XMP), tIME (decision 3).
    class Png
      SIGNATURE = "\x89PNG\r\n\x1A\n".b

      # Critical chunks, colour and transparency, physical size, and APNG's frames.
      KEEP = %w[IHDR PLTE IDAT IEND tRNS cHRM gAMA iCCP sBIT sRGB cICP mDCv cLLi bKGD pHYs acTL fcTL fdAT].freeze

      def self.call(bytes, orientation: 1) = new(bytes).call

      def initialize(bytes)
        @bytes = bytes
      end

      def call
        raise Malformed, "not a PNG" unless @bytes.start_with?(SIGNATURE)

        out = SIGNATURE.dup
        pos = SIGNATURE.bytesize
        loop do
          raise Malformed, "truncated chunk" if pos + 8 > @bytes.bytesize

          length, type = @bytes.byteslice(pos, 8).unpack("Na4")
          size = 12 + length # length, type, data, CRC
          raise Malformed, "truncated chunk" if pos + size > @bytes.bytesize

          out << @bytes.byteslice(pos, size) if KEEP.include?(type)
          pos += size
          return out if type == "IEND" # anything after it is dropped
        end
      end
    end
  end
end
