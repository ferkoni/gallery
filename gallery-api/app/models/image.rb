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

  # The entry point the controller reaches through BaseApi#apply_filters. Which
  # strategy answers it is decided by adapter availability inside the service, never
  # by a request parameter: the client sends the same ?q= whether or not this install
  # has AI, so INFERENCE_MODE=none behaves exactly as it did before 07.
  def self.global_search(q)
    Images::Search.call(scope: all, query: q)
  end

  # The lexical half, on its own so the search service can rank it independently of
  # the semantic half. `tags` is unpopulated on every row today, so in practice this
  # is a substring match over titles — which is why it answers almost no
  # natural-language query at all (see 08's baseline).
  def self.lexical_search(q)
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

  validate :album_belongs_to_owner
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
  private

  # The controller guard on #create covers the only path a user can reach. This covers
  # everything else — a console session, a rake task, a service written later — because
  # the damage is done by the row existing, not by how it got there.
  #
  # Fails as RecordInvalid, which Images::Upload already rescues by deleting the object
  # it just uploaded, so the S3 rollback needs no changes to stay correct.
  def album_belongs_to_owner
    return if album.blank? || user_id.blank?

    errors.add(:album, "does not belong to this user") if album.user_id != user_id
  end
end
