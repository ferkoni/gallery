class ImageEmbedding < ApplicationRecord
  belongs_to :image

  # Registers the pgvector type, so `embedding` is a Ruby Array in both directions.
  # Deliberately not passing `dimensions:` — that would put the width in a second place
  # and make a constant, rather than the column, the thing everybody reads.
  has_neighbors :embedding

  # float32 round-trip noise, not model error.
  MAX_NORM_DRIFT = 1e-3

  # arch / weights provenance / pipeline revision. Validates the shape, never the
  # vocabulary: a SigLIP sidecar and a hosted Remote backend both have to pass, or this
  # becomes the thing blocking a legitimate backend and gets deleted rather than fixed.
  MODEL_ID_FORMAT = %r{\A[a-z0-9]+(?:-[a-z0-9]+)*/[a-z0-9._-]+/v\d+\z}

  validates :model_id, presence: true, format: {
    with: MODEL_ID_FORMAT,
    message: "must be arch/provenance/vN, e.g. clip-vit-b-32/openai/v1"
  }
  validates :dimensions, presence: true

  validate :embedding_is_normalized
  validate :dimensions_match_column

  # The column is the source of truth. Reading atttypmod rather than a constant is the
  # whole point: a check fed by a constant tests two constants against each other.
  #
  # Memoized per process — the width cannot change without a migration. Safe in
  # development because model classes are reloadable, so the ivar is discarded on reload.
  def self.column_dimensions
    @column_dimensions ||= connection.select_value(<<~SQL).to_i
      SELECT atttypmod
      FROM pg_attribute
      WHERE attrelid = 'image_embeddings'::regclass AND attname = 'embedding'
    SQL
  end

  private

  # Asserted at write time rather than hoped for. Normalized vectors are what let <=>
  # order identically to <#> and <->, and what every consumer assumes.
  def embedding_is_normalized
    return if embedding.blank?

    norm = Math.sqrt(embedding.sum { |x| x * x })
    return if (norm - 1.0).abs < MAX_NORM_DRIFT

    errors.add(:embedding, "is not L2-normalized (norm=#{norm.round(4)})")
  end

  # The second of the two layers guarding dimensionality. The first is the boot-time
  # assertion in config/initializers/inference.rb, which skips when the adapter is
  # unreachable — so this one, which needs no network and no particular moment, is what
  # actually makes a mismatched row impossible.
  #
  # Note what neither layer catches: two models of the SAME width (ViT-B/16 and B/32 are
  # both 512-d) writing into one column. That is handled by model_id — derived in the
  # sidecar, and mandatory in every read filter — not here.
  def dimensions_match_column
    return if dimensions.blank?
    return if dimensions == self.class.column_dimensions

    errors.add(:dimensions,
               "is #{dimensions} but image_embeddings.embedding is " \
               "vector(#{self.class.column_dimensions})")
  end
end
