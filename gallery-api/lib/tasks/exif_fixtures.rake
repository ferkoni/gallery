# Regenerates the spec fixtures for Exif::Strip.
#
# The fixtures are committed, so this task is not part of any test run — it exists
# so the files can be rebuilt and reviewed rather than being opaque binaries nobody
# can reproduce. Run it with: bin/rails exif:fixtures
#
# The issue for this work assumed exiftool was needed to write GPS tags. It is not:
# libvips writes EXIF through the same mutate/set_type! path it uses to read it, and
# ruby-vips is already a dependency. That removes a system package from the setup
# instructions for anyone who ever has to touch these.
#
# The one caveat worth knowing: these are vips-written EXIF blocks, not blocks from a
# real camera. That is a narrower test than a phone photo would be. The specs
# compensate by asserting on the raw JPEG marker segments rather than only on what
# vips reports back, so a bug confined to vips' own reader cannot hide a failure.
namespace :exif do
  desc "Regenerate the Exif::Strip spec fixtures (committed; run only when they change)"
  task fixtures: :environment do
    require "vips"

    dir = Rails.root.join("spec/fixtures/files")
    FileUtils.mkdir_p(dir)

    # A saturated gradient rather than flat colour: flat images compress to almost
    # nothing and would make the wide-gamut fixture's profile the only thing in it.
    base = lambda do |width, height|
      x = Vips::Image.xyz(width, height)
      r = (x[0] * (255.0 / width)).cast(:uchar)
      g = (x[1] * (255.0 / height)).cast(:uchar)
      b = ((x[0] + x[1]) * (255.0 / (width + height))).cast(:uchar)
      r.bandjoin([ g, b ]).copy(interpretation: :srgb)
    end

    # libvips EXIF values are written in its own round-trip format:
    #   "<raw> (<interpreted>, <type>, <count>)"
    # The trailing parenthetical is what tells it the tag's TIFF type.
    # Carries a colour profile as well as the EXIF, because a real phone photo carries
    # both — and because the interesting assertion is that one survives while the other
    # does not. A fixture with GPS but no profile can only prove half of that.
    gps = base.call(160, 120).icc_transform("p3").mutate do |img|
      {
        "exif-ifd3-GPSLatitude" => "51/1 30/1 26/1 (51, 30, 26, Rational, 3)",
        "exif-ifd3-GPSLatitudeRef" => "N (N, ASCII, 2)",
        "exif-ifd3-GPSLongitude" => "0/1 7/1 39/1 (0, 7, 39, Rational, 3)",
        "exif-ifd3-GPSLongitudeRef" => "W (W, ASCII, 2)",
        "exif-ifd3-GPSAltitude" => "35/1 (35, Rational, 1)",
        "exif-ifd0-Make" => "FixtureCam (FixtureCam, ASCII, 11)",
        "exif-ifd0-Model" => "FC-1 (FC-1, ASCII, 5)",
        "exif-ifd2-DateTimeOriginal" => "2019:07:14 18:23:07 (2019:07:14 18:23:07, ASCII, 20)",
        "exif-ifd2-BodySerialNumber" => "SN-0042 (SN-0042, ASCII, 8)"
      }.each { |field, value| img.set_type!(GObject::GSTR_TYPE, field, value) }
    end
    gps.write_to_file(dir.join("gps_tagged.jpg").to_s)

    # Display P3, from libvips' built-in profile, so this needs no ICC file on disk.
    # Stripped of its profile this renders as sRGB — visibly duller, with no error.
    base.call(160, 120)
        .icc_transform("p3")
        .write_to_file(dir.join("wide_gamut.jpg").to_s)

    # Landscape pixels tagged Orientation=6 (rotate 90° clockwise for display), so a
    # correct strip returns portrait. Dropping the tag instead of applying it returns
    # landscape, which is the bug this fixture exists to catch.
    #
    # Orientation is the one tag that must NOT be written as an "exif-ifd0-" string:
    # vips owns orientation as a first-class field and regenerates the EXIF tag from
    # it on save, so a string written here is silently overwritten with 1 and the
    # fixture tests nothing. Set the native field instead.
    base.call(160, 120)
        .mutate { |img| img.set_type!(GObject::GINT_TYPE, "orientation", 6) }
        .write_to_file(dir.join("rotated.jpg").to_s)

    # No metadata at all — keep: :none, because vips writes a default EXIF block
    # (resolution, colour space, Exif version) even when nothing asked it to. The
    # adapter specs need *some* decodable image now that embed_image decodes what it
    # is given, and they should not carry EXIF baggage unrelated to what they assert.
    File.binwrite(dir.join("plain.jpg"), base.call(32, 32).write_to_buffer(".jpg", keep: :none))

    dir.glob("{gps_tagged,wide_gamut,rotated,plain}.jpg").sort.each do |path|
      puts format("%-40s %6dB", path.relative_path_from(Rails.root), path.size)
    end
  end
end
