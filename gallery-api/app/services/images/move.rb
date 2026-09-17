# Moves photos into one folder, all or nothing. The caller has already checked the folder
# belongs to the user: update_all skips Image#album_belongs_to_owner.
#
# One UPDATE, whose affected-row count is the check that every id is the user's and still
# exists. A separate count would leave a window for a photo to be deleted before the update.
# No S3 calls: keys are opaque, and a photo's folder lives only in the row.
class Images::Move < Images::Base
  MAX_IDS = 500
  NOT_FOUND = "Not found"

  def initialize(user:, ids:, album:)
    @user = user
    @ids = ids
    @album = album
  end

  def call
    # Anything that isn't an integer becomes nil, which matches no row and so fails the count.
    # A non-array — nil, or a bare id a client sent unwrapped — is a malformed list, not a list
    # of photos that don't exist, so it answers 422 like an empty one (02, decision 9).
    ids = @ids.is_a?(Array) ? @ids.map { Integer(it, exception: false) }.uniq : nil
    return failure("Choose between 1 and #{MAX_IDS} photos to move") unless ids&.size&.between?(1, MAX_IDS)

    moved = 0
    Image.transaction do
      moved = Image.with_user(@user).where(id: ids)
                   .update_all(album_id: @album.id, updated_at: Time.current)
      raise ActiveRecord::Rollback unless moved == ids.size
    end

    moved == ids.size ? success : failure(NOT_FOUND)
  rescue ActiveRecord::InvalidForeignKey
    # The folder was deleted after the controller found it. Without this it would reach
    # BaseApi as StatementInvalid, a 400.
    failure(NOT_FOUND)
  end
end
