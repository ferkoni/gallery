require "rails_helper"

RSpec.describe Inference::DimensionCheck do
  # A backend whose width disagrees with the column. This is the whole reason the seam
  # was built before the feature: the assertion is provable with no sidecar, no Python
  # and no GPU.
  let(:wrong_width) do
    Class.new(Inference::Fake) do
      def dimensions = 768
    end.new
  end

  let(:matching) { Inference::Fake.new }
  let(:logger) { instance_double(Logger, warn: nil) }

  it "passes when the adapter's width matches the column" do
    expect(described_class.call(adapter: matching, mode: :local, logger: logger)).to eq(:ok)
  end

  it "stops the boot when the widths disagree, naming both numbers" do
    expect {
      described_class.call(adapter: wrong_width, mode: :local, logger: logger)
    }.to raise_error(described_class::Mismatch, /768.*vector\(512\)/m)
  end

  it "names the escape hatch in the message, since the fix needs a boot to apply" do
    expect {
      described_class.call(adapter: wrong_width, mode: :local, logger: logger)
    }.to raise_error(/SKIP_INFERENCE_CHECKS=1/)
  end

  describe "the escape hatch" do
    # Without this a genuine mismatch is a deadlock: initializers load for db:migrate as
    # well as the server, so the migration that fixes it could never run.
    it "skips entirely when SKIP_INFERENCE_CHECKS is set" do
      ENV["SKIP_INFERENCE_CHECKS"] = "1"

      expect(described_class.call(adapter: wrong_width, mode: :local, logger: logger))
        .to eq(:skipped_by_env)
    ensure
      ENV.delete("SKIP_INFERENCE_CHECKS")
    end
  end

  describe "when the adapter is unavailable" do
    let(:unavailable) do
      Class.new(Inference::Fake) do
        def available? = false
      end.new
    end

    it "skips, because there is nothing to compare against" do
      expect(described_class.call(adapter: unavailable, mode: :local, logger: logger))
        .to eq(:skipped_unavailable)
    end

    # A silent skip is indistinguishable from a pass, and under :local it means the
    # sidecar was unreachable rather than that anything was verified.
    it "warns under :local, so the skip is visible" do
      described_class.call(adapter: unavailable, mode: :local, logger: logger)

      expect(logger).to have_received(:warn).with(/dimension check skipped/)
    end

    it "stays quiet under :none, where there is no vector space to check" do
      described_class.call(adapter: Inference::Null.new, mode: :none, logger: logger)

      expect(logger).not_to have_received(:warn)
    end
  end
end
