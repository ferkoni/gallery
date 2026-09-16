require "rails_helper"

RSpec.describe Images::ThumbnailBackfill, type: :service do
  let(:user) { create(:user) }
  let(:album) { create(:album, user: user) }
  let!(:credential) { create(:s3_credential, user: user) }
  let(:storage) { instance_double(S3::Storage) }
  let(:out) { StringIO.new }

  # A real JPEG larger than the box, so the generator does real work on every example.
  let(:original_bytes) { Vips::Image.black(800, 600, bands: 3).write_to_buffer(".jpg") }

  before do
    allow(S3::Storage).to receive(:for).and_return(storage)
    allow(storage).to receive(:stream_object).and_yield(original_bytes)
    allow(storage).to receive(:put) { |key, *| key }
    allow(storage).to receive(:delete_object)
  end

  def call = described_class.call(out: out)

  it "generates a thumbnail beside the original and records its key" do
    image = create(:image, user: user, album: album, s3_key: "images/uuid/beach.jpg")

    summary = call

    expect(storage).to have_received(:put)
      .with("images/uuid/beach.thumb.webp", an_instance_of(StringIO), content_type: "image/webp")
    expect(image.reload.thumb_key).to eq("images/uuid/beach.thumb.webp")
    expect(summary).to have_attributes(generated: 1, failed: 0, skipped: 0)
  end

  it "reads the original, never an existing thumbnail" do
    image = create(:image, user: user, album: album)

    call

    expect(storage).to have_received(:stream_object).with(image.s3_key)
  end

  it "does not fetch an image that already has a thumbnail" do
    create(:image, :with_thumbnail, user: user, album: album)

    summary = call

    expect(storage).not_to have_received(:stream_object)
    expect(summary.generated).to eq(0)
  end

  it "does nothing on a second run" do
    create(:image, user: user, album: album)
    call

    expect(call).to have_attributes(generated: 0, failed: 0, skipped: 0)
    expect(storage).to have_received(:stream_object).once
  end

  context "when one image fails" do
    let!(:broken) { create(:image, user: user, album: album) }
    let!(:fine) { create(:image, user: user, album: album) }

    before do
      allow(storage).to receive(:stream_object).with(broken.s3_key).and_yield("not an image")
    end

    it "counts it, skips it and finishes the rest" do
      expect(call).to have_attributes(generated: 1, failed: 1)
      expect(fine.reload.thumb_key).to be_present
    end

    it "leaves it without a thumbnail, so the next run retries it" do
      call

      expect(Image.without_thumbnail).to eq([ broken ])
    end

    it "names it in the output" do
      call

      expect(out.string).to include("image #{broken.id}")
    end
  end

  it "counts an S3 failure as a failure, not a crash" do
    create(:image, user: user, album: album)
    allow(storage).to receive(:put).and_raise(Aws::S3::Errors::ServiceError.new(nil, "access denied"))

    expect(call).to have_attributes(generated: 0, failed: 1)
  end

  it "skips a user with no S3 credentials rather than failing them" do
    stranger = create(:user)
    create_list(:image, 2, user: stranger, album: create(:album, user: stranger))
    allow(S3::Storage).to receive(:for).with(nil).and_return(nil)

    expect(call).to have_attributes(generated: 0, failed: 0, skipped: 2)
  end

  # Images::Destroy read s3_keys before the thumbnail's key was saved, so nothing else
  # would ever delete that object.
  it "deletes the thumbnail it just wrote when the image was deleted meanwhile" do
    image = create(:image, user: user, album: album, s3_key: "images/uuid/beach.jpg")
    allow(storage).to receive(:put) do |key, *|
      Image.where(id: image.id).delete_all
      key
    end

    summary = call

    expect(storage).to have_received(:delete_object).with("images/uuid/beach.thumb.webp")
    expect(summary.generated).to eq(0)
  end
end
