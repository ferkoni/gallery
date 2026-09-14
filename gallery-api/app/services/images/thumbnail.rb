# Makes the grid's thumbnail for a photo, and names the object it is stored under.
#
# One thumbnail, for the grid. The lightbox shows the original on purpose — the user
# sees the file they uploaded — so there is no larger size.
class Images::Thumbnail
  # Raised when vips cannot produce a thumbnail. Its own class so Images::Upload can
  # report it as "could not be processed" without rescuing Vips::Error itself.
  class GenerationFailed < StandardError; end

  # The only place the size is written down. Square and centre-cropped, so every
  # thumbnail of a photo larger than the box is SIZE on both edges whatever its
  # orientation. Changing it affects new thumbnails only: set thumb_key to NULL and
  # re-run images:backfill_thumbnails, which overwrites in place because the key does
  # not contain the size.
  SIZE = 400

  # WebP for the thumbnail only. The original keeps its format, which is what the
  # lightbox shows, what downloads, what ImageEmbeddingJob reads, and what `url` still
  # points at.
  FORMAT = ".webp[Q=80]".freeze
  CONTENT_TYPE = "image/webp".freeze

  # Returns a rewound StringIO of WebP bytes, and leaves `io` rewound too, so the
  # caller can still upload the original from it.
  #
  # Keeps Exif::Strip::KEEP (the colour profile) and nothing else. Uploads hand this
  # bytes that are already stripped, but the backfill reads originals that may predate
  # #26, and a thumbnail made from one of those would otherwise carry GPS into a file
  # the grid hands to every viewer.
  def self.generate(io)
    io.rewind
    # thumbnail_buffer shrinks on load and applies the EXIF orientation. `size: :down`
    # never upscales: an original smaller than the box comes back at its own size,
    # uncropped, and the tile's object-cover crops it instead.
    image = Vips::Image.thumbnail_buffer(io.read, SIZE, height: SIZE, crop: :centre, size: :down)
    StringIO.new(image.write_to_buffer(FORMAT, keep: Exif::Strip::KEEP))
  rescue Vips::Error => e
    raise GenerationFailed, "could not generate a thumbnail: #{e.message}"
  ensure
    io.rewind
  end

  # `beach.jpg` → `beach.thumb.webp`, in the original's own <uuid> folder. Never just
  # the extension swapped: a WebP upload's thumbnail would then *be* its original's key,
  # and the thumbnail PUT would overwrite the user's photo.
  def self.key_for(s3_key)
    "#{s3_key.delete_suffix(File.extname(s3_key))}.thumb.webp"
  end
end
