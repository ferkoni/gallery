class ImageSerializer
  include JSONAPI::Serializer
  attributes :id, :title, :description, :tags, :album_id, :favorited, :created_at

  attribute :url do |object, params|
    params[:presigner]&.presigned_url(:get_object, bucket: params[:bucket], key: object.s3_key, expires_in: 3600)
  end
end
