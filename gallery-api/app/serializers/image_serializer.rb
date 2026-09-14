class ImageSerializer
  include JSONAPI::Serializer
  attributes :id, :title, :description, :tags, :album_id, :favorited, :created_at

  # Always the original: what the lightbox shows, by decision.
  attribute :url do |object, params|
    params[:presigner]&.presigned_url(:get_object, bucket: params[:bucket], key: object.s3_key, expires_in: 3600)
  end

  # For the grid. Falls back to the original for an image that predates thumbnails, or
  # that images:backfill_thumbnails failed on — slow, but never a broken tile. A new
  # upload always has one: Images::Upload cannot save the row without it.
  attribute :thumbnail_url do |object, params|
    params[:presigner]&.presigned_url(:get_object, bucket: params[:bucket], key: object.thumb_key || object.s3_key, expires_in: 3600)
  end
end
