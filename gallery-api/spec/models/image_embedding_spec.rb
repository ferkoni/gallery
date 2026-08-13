require "rails_helper"

RSpec.describe ImageEmbedding, type: :model do
  describe "associations" do
    it { should belong_to(:image) }
  end

  describe "the vector round-trips as an Array" do
    # Without the neighbor gem this comes back as a String, and every check below that
    # treats it as a vector would raise rather than fail.
    it "reads back as an Array of floats" do
      record = create(:image_embedding)

      expect(record.reload.embedding).to be_an(Array)
      expect(record.reload.embedding.size).to eq(described_class.column_dimensions)
    end
  end

  describe "normalization" do
    it "accepts a unit vector" do
      expect(build(:image_embedding)).to be_valid
    end

    it "rejects a vector that is not L2-normalized" do
      record = build(:image_embedding,
                     embedding: Array.new(described_class.column_dimensions, 1.0))

      expect(record).not_to be_valid
      expect(record.errors[:embedding].first).to match(/not L2-normalized/)
    end

    it "tolerates float32 round-trip drift" do
      width = described_class.column_dimensions
      drifted = Array.new(width) { (1.0 / Math.sqrt(width)) * 1.0001 }

      expect(build(:image_embedding, embedding: drifted)).to be_valid
    end
  end

  describe "dimensions" do
    it "reads the width from the column rather than a constant" do
      expect(described_class.column_dimensions).to eq(512)
    end

    # The layer that does not depend on the sidecar being reachable at boot.
    it "rejects a row whose declared dimensions disagree with the column" do
      record = build(:image_embedding, dimensions: 768)

      expect(record).not_to be_valid
      expect(record.errors[:dimensions].first).to match(/is 768 but .* vector\(512\)/)
    end
  end

  describe "model_id" do
    it "requires the arch/provenance/vN shape" do
      expect(build(:image_embedding, model_id: "clip")).not_to be_valid
      expect(build(:image_embedding, model_id: "clip-vit-b-32/openai")).not_to be_valid
      expect(build(:image_embedding, model_id: "clip-vit-b-32/openai/v1")).to be_valid
    end

    it "accepts a non-CLIP family, so the check cannot block a legitimate backend" do
      expect(build(:image_embedding, model_id: "voyage-multimodal-3/voyage/v1")).to be_valid
      expect(build(:image_embedding, model_id: "fake/test/v1")).to be_valid
    end

    it "rejects case variants, which would fork one model into two spaces" do
      expect(build(:image_embedding, model_id: "clip-ViT-B-32/openai/v1")).not_to be_valid
    end

    it "rejects blank, the value every broken producer converges on" do
      expect(build(:image_embedding, model_id: "")).not_to be_valid
      expect(build(:image_embedding, model_id: "   ")).not_to be_valid
    end
  end

  describe "database-level guarantees" do
    # Observed from outside ActiveRecord on purpose: these are supposed to live in the
    # database, and a spec cannot tell a constraint from a callback by asking Rails.
    let(:image) { create(:image) }

    it "rejects a blank model_id even when validations are bypassed" do
      expect {
        described_class.connection.execute(<<~SQL)
          INSERT INTO image_embeddings (image_id, model_id, dimensions, embedding, created_at, updated_at)
          VALUES (#{image.id}, '   ', 512, '#{unit_vector_literal}', now(), now())
        SQL
      }.to raise_error(ActiveRecord::StatementInvalid, /image_embeddings_model_id_not_blank/)
    end

    it "makes double-embedding impossible" do
      create(:image_embedding, image: image, model_id: "clip-vit-b-32/openai/v1")
      duplicate = build(:image_embedding, image: image, model_id: "clip-vit-b-32/openai/v1")

      expect { duplicate.save!(validate: false) }
        .to raise_error(ActiveRecord::RecordNotUnique)
    end

    it "allows the same image under a different model, so a cutover can run alongside" do
      create(:image_embedding, image: image, model_id: "clip-vit-b-32/openai/v1")
      other = build(:image_embedding, image: image, model_id: "clip-vit-b-32/openai/v2")

      expect(other).to be_valid
      expect { other.save! }.to change(described_class, :count).by(1)
    end

    it "deletes vectors with their image at the database level" do
      create(:image_embedding, image: image)

      # Raw SQL, not image.destroy: an ActiveRecord callback would not fire here, so this
      # distinguishes the foreign key from a callback wearing its clothes.
      described_class.connection.execute("DELETE FROM images WHERE id = #{image.id}")

      expect(described_class.where(image_id: image.id).count).to eq(0)
    end

    it "has no ANN index, so the eval harness can still price one when it is added" do
      indexes = described_class.connection.indexes(:image_embeddings)

      expect(indexes.map(&:using).map(&:to_s)).to all(eq("btree"))
    end
  end

  def unit_vector_literal
    width = described_class.column_dimensions
    "[#{Array.new(width) { 1.0 / Math.sqrt(width) }.join(',')}]"
  end
end
