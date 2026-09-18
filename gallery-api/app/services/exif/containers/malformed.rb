module Exif
  module Containers
    # Raised when bytes claim a format but do not follow its structure: a length that runs
    # past the end, a JPEG with no end-of-image, a GIF block with an unknown introducer.
    # Exif::Scrub translates it, so callers see one error for "not an image we can store".
    class Malformed < StandardError; end
  end
end
