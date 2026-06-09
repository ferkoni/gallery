class Image < ApplicationRecord
  include Userable
  include Filterable

  belongs_to :album

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
