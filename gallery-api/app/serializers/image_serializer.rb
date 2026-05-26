class ImageSerializer
  include JSONAPI::Serializer
  attributes :id, :title, :album_id, :created_at

  attribute :url do |object, params|
    params[:credential]&.presigned_get_url(object.s3_key)
  end
end
