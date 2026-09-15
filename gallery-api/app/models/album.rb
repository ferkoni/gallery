# Shown to users as a "folder". The API, the schema and this code say "album"; the
# rename was UI-only by decision (docs: nested-folders/02, decision 1).
class Album < ApplicationRecord
  include Userable

  belongs_to :parent, class_name: "Album", optional: true

  # No dependent: on purpose. Images::AlbumDestroy owns subtree deletion because the S3
  # objects have to go first; a stray album.destroy! on a folder with children fails on the
  # foreign key rather than orphaning every object underneath it.
  has_many :children, class_name: "Album", foreign_key: :parent_id, inverse_of: :parent

  has_many :images, dependent: :destroy

  # The entry point the controller reaches through BaseApi#apply_filters, mirroring
  # Image.search_by_title. A name substring is the whole of it: there is no AI tier for
  # folders, and nothing else about a folder is worth matching on.
  def self.global_search(q)
    where("name ILIKE ?", "%#{sanitize_sql_like(q)}%")
  end

  validates :user, presence: true
  validates :name, presence: true, length: { maximum: 50 }
  validates :description, length: { maximum: 500 }, allow_blank: true

  validate :parent_belongs_to_owner
  validate :parent_is_not_self_or_descendant, if: -> { persisted? && will_save_change_to_parent_id? }

  private

  # The controller's 404 guard covers every request; this covers everything else — a console
  # session, a rake task, a service written later — the way Image#album_belongs_to_owner does.
  def parent_belongs_to_owner
    return if parent.blank? || user_id.blank?

    errors.add(:parent_id, "does not belong to this user") if parent.user_id != user_id
  end

  # A new folder has no descendants, so only a move can create a cycle. subtree_ids reads
  # the STORED tree, which is what the check needs: it asks whether the proposed parent is
  # currently below this folder.
  def parent_is_not_self_or_descendant
    return if parent_id.nil?

    if parent_id == id || Albums::Tree.subtree_ids(self).include?(parent_id)
      errors.add(:parent_id, "cannot be the folder itself or one of its subfolders")
    end
  end
end
