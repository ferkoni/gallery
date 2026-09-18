module Exif
  module Containers
    # Rewrites a JPEG's marker segments, keeping the ones on an allowlist and copying the
    # compressed image data byte for byte. Never decodes: the stored photo is the uploaded
    # photo, minus its metadata (docs: lossless-exif-strip/02, decisions 2–4).
    class Jpeg
      SOI = "\xFF\xD8".b
      EOI = "\xFF\xD9".b

      SOS = 0xDA
      COM = 0xFE
      APP0 = 0xE0
      APP2 = 0xE2
      APP14 = 0xEE
      APPN = (0xE0..0xEF)
      RST = (0xD0..0xD7)

      def self.call(bytes, orientation: 1) = new(bytes, orientation).call

      def initialize(bytes, orientation)
        @bytes = bytes
        @orientation = orientation
      end

      def call
        raise Malformed, "not a JPEG" unless @bytes.start_with?(SOI)

        out = SOI.dup
        pos = SOI.bytesize
        orientation_written = false

        loop do
          raise Malformed, "expected a marker" unless @bytes.getbyte(pos) == 0xFF

          pos += 1 while @bytes.getbyte(pos + 1) == 0xFF # fill bytes before a marker
          marker = @bytes.getbyte(pos + 1) or raise Malformed, "no end of image"
          pos += 2

          # Everything after EOI is dropped: a motion photo's video, an Ultra HDR gain map,
          # a vendor trailer (decision 3).
          return out << EOI if marker == 0xD9

          length = read_length(pos)
          payload = @bytes.byteslice(pos + 2, length - 2)
          pos += length

          # After JFIF, which must come first, and before anything else.
          unless orientation_written || marker == APP0
            out << orientation_segment unless @orientation == 1
            orientation_written = true
          end

          if (kept = keep(marker, payload))
            out << [ 0xFF, marker, kept.bytesize + 2 ].pack("CCn") << kept
          end

          pos = copy_scan(pos, out) if marker == SOS
        end
      end

      private

      def read_length(pos)
        raise Malformed, "truncated segment" if pos + 2 > @bytes.bytesize

        length = @bytes.byteslice(pos, 2).unpack1("n")
        raise Malformed, "bad segment length" if length < 2 || pos + length > @bytes.bytesize

        length
      end

      # The allowlist (decision 3). Every non-APP, non-COM segment is image structure —
      # tables, frame, scan headers, restart interval — and is kept as it is.
      def keep(marker, payload)
        case marker
        # JFIF's 14-byte header, with the thumbnail it may carry cut off and its size zeroed.
        when APP0 then payload.start_with?("JFIF\x00".b) && payload.bytesize >= 14 ? payload.byteslice(0, 12) + "\x00\x00".b : nil
        when APP2 then payload if payload.start_with?("ICC_PROFILE\x00".b)
        # Says whether a CMYK or YCCK file's colours are transformed; without it they invert.
        when APP14 then payload if payload.start_with?("Adobe".b)
        when APPN, COM then nil
        else payload
        end
      end

      # Entropy-coded data runs until the next real marker: 0xFF followed by anything but a
      # stuffed 0x00, a fill 0xFF or a restart marker. Progressive files have several scans,
      # with tables between them, so this returns to the segment loop rather than to EOI.
      def copy_scan(pos, out)
        start = pos
        loop do
          ff = @bytes.index("\xFF".b, pos) or raise Malformed, "no end of image"
          following = @bytes.getbyte(ff + 1) or raise Malformed, "no end of image"

          if following.zero? || RST.cover?(following) || following == 0xFF
            pos = ff + (following == 0xFF ? 1 : 2)
          else
            out << @bytes.byteslice(start, ff - start)
            return ff
          end
        end
      end

      # The one tag kept, and only when it says something: "Exif\0\0", a big-endian TIFF
      # header, and an IFD0 holding a single SHORT, 0x0112 Orientation (decision 4).
      def orientation_segment
        tiff = "MM\x00\x2A".b + [ 8, 1 ].pack("Nn") + [ 0x0112, 3, 1, @orientation, 0, 0 ].pack("nnNnnN")
        body = "Exif\x00\x00".b + tiff
        [ 0xFF, 0xE1, body.bytesize + 2 ].pack("CCn") + body
      end
    end
  end
end
