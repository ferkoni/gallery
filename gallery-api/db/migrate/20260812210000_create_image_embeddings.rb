class CreateImageEmbeddings < ActiveRecord::Migration[8.1]
  def change
    create_table :image_embeddings do |t|
      # index: false because the unique composite index below already serves lookups
      # by image_id; the default single-column index would be redundant.
      t.references :image, null: false, foreign_key: { on_delete: :cascade }, index: false

      # The producing model. Not decorative: every read filters on it, so a vector from
      # a different model can never enter a result set for the active one.
      t.string :model_id, null: false

      # Fixed by the column type below. Stored redundantly so a mismatch is detectable
      # in SQL without parsing the type, and so the producing adapter's own claim about
      # its width is recorded rather than assumed.
      t.integer :dimensions, null: false

      t.timestamps
    end

    # pgvector types cannot be declared through the standard column helpers.
    #
    # 512 is CLIP ViT-B/32. Changing to a model of different dimensionality is a
    # migration plus a full re-backfill — see the design document.
    execute "ALTER TABLE image_embeddings ADD COLUMN embedding vector(512) NOT NULL"

    # `null: false` does not cover the empty string, and '' is the value every broken
    # producer converges on: a sidecar reporting it selects, writes and searches
    # entirely self-consistently, so two different embedding spaces would end up sharing
    # one nameless label with nothing to signal it. btrim rather than <> '' because a
    # single space fails identically and would pass the naive check.
    execute <<~SQL
      ALTER TABLE image_embeddings
        ADD CONSTRAINT image_embeddings_model_id_not_blank
        CHECK (btrim(model_id) <> '')
    SQL

    # One embedding per image per model. This is what makes re-running the backfill safe
    # and double-embedding impossible.
    add_index :image_embeddings, %i[image_id model_id], unique: true

    # Reads are always "the active model's vectors for this user".
    add_index :image_embeddings, :model_id

    # Deliberately NO ANN index. Exact search has 100% recall, no tuning surface, and is
    # a few milliseconds at this scale — and an index added before it is measured cannot
    # ever have its recall cost reported, which is a row the eval harness (08) exists to
    # produce. The row count that decides this is per user, not per table.
  end
end
