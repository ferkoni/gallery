class Image < ApplicationRecord
  include Userable
  include Filterable

  belongs_to :album

  # dependent: nothing on purpose — the cascade is a database-level foreign key, so it
  # fires for bulk deletes and raw SQL too, and Images::Destroy does not need to know
  # embeddings exist.
  has_many :image_embeddings

  # Which images still need embedding is derived, never stored: a status column would
  # need updating on every insert, every failure and every model change, and would be
  # wrong after any crash.
  #
  # Per-model, not model-blind. `where.missing(:image_embeddings)` — "has no embedding at
  # all" — is correct exactly once, on the first backfill of a fresh install. After any
  # model_id bump every image still has its old row, so it would select nothing: the
  # backfill would enqueue zero jobs and report success while search, which filters on
  # the active model, returned empty for every user.
  #
  # The argument is required rather than defaulting to Inference.adapter.model_id,
  # because that reader is an HTTP call to the sidecar — a scope that performs network
  # I/O when evaluated would do it once per progress tick. Resolve it once at the top of
  # the operation and pass it down.
  scope :needing_embedding, ->(model_id) {
    where(<<~SQL.squish, model_id: model_id)
      NOT EXISTS (
        SELECT 1 FROM image_embeddings e
        WHERE e.image_id = images.id AND e.model_id = :model_id
      )
    SQL
  }

  def self.global_search(q)
    search_by_title(q).or(search_by_tag(q))
  end

  def self.search_by_title(title)
    where("title ILIKE ?", "%#{sanitize_sql_like(title)}%")
  end

  def self.search_by_tag(tag)
    where("? = ANY(tags)", tag)
  end

  validates :title, presence: true
  validates :s3_key, presence: true, uniqueness: true
  validates :user, presence: true
  validates :album, presence: true

  validate :tags_length

  private

  def tags_length
    return if tags.blank?
    tags.each do |tag|
      if tag&.length.to_i > 25
        errors.add(:tags, "each tag must be 25 characters or fewer (got #{tag.length} for #{tag.inspect})")
      end
    end
  end
end
