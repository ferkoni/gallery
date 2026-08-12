# Real image bytes for specs that pass an IO to Inference::Base#embed_image.
#
# Needed because that method decodes what it is given from #03 onwards: the EXIF
# strip sits at the chokepoint, so `StringIO.new("bytes")` — which every adapter spec
# used before — is no longer a valid stand-in for a photo. It now raises InvalidInput,
# which is correct behaviour and useless as test scaffolding.
#
# Regenerate the fixtures with: bin/rails exif:fixtures
module ImageFixtures
  def fixture_file(name) = Rails.root.join("spec/fixtures/files", name)

  # A 32x32 JPEG carrying no metadata at all, for specs that care about the plumbing
  # rather than about metadata. Fresh handle per call — these get read and rewound.
  def plain_image = File.open(fixture_file("plain.jpg"), "rb")

  def plain_image_bytes = File.binread(fixture_file("plain.jpg"))
end

RSpec.configure do |config|
  config.include ImageFixtures
end
