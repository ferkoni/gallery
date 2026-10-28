require "rails_helper"

RSpec.describe Albums::Slug do
  describe ".for" do
    it "transliterates accents and joins words with one dash" do
      expect(described_class.for("Día 2 en Madrid!")).to eq("dia-2-en-madrid")
    end

    it "gives album for a name with no letters or digits" do
      puts described_class.for("📷 !!")
    end

    it "cuts a long slug at the last dash before 30 characters" do
      expect(described_class.for("A very long album name about the summer trip")).to eq("a-very-long-album-name-about")
    end
  end
end
