class Api::ImagesController < ApplicationController
  include BaseApi

  before_action :authorize_resource!, only: %i[show update destroy]

  # POST /api/images
  # Expects multipart/form-data with:
  #   image[file]      — the file itself
  #   image[title]     — display name (optional, defaults to filename)
  #   image[album_id]  — which album to file it under
  def create
    result = Images::Upload.call(
      user: current_user,
      credential: current_user.s3_credential,
      file: params.require(:image).require(:file),
      title: params.dig(:image, :title),
      album_id: params.dig(:image, :album_id)
    )

    if result.success?
      render json: serializer.new(result.record, params: serializer_params)
                             .serializable_hash.to_json, status: :created
    else
      render json: { errors: result.error }, status: :unprocessable_content
    end
  end

  # PATCH /api/images/:id
  # Updates metadata (title, description, tags, album_id). The S3 object is never
  # touched. If album_id is supplied it must belong to the current user; otherwise
  # Album.with_user raises RecordNotFound → 404 via BaseApi rescue.
  def update
    if (new_album_id = resource_params[:album_id])
      Album.with_user(current_user).find(new_album_id)
    end
    resource.update!(resource_params)
    render json: serializer.new(resource, params: serializer_params)
                           .serializable_hash.to_json
  end

  # DELETE /api/images/:id
  # Delegates to Images::Destroy, which deletes the S3 object first and
  # only then destroys the DB record. If S3 fails the DB record is untouched
  # and a 422 is returned. If S3 succeeds but DB destroy fails (near-impossible),
  # the s3_key is logged and a 422 is returned. Missing credentials → 422.
  def destroy
    result = Images::Destroy.call(
      image: resource,
      credential: current_user.s3_credential
    )

    if result.success?
      head :no_content
    else
      render json: { errors: result.error }, status: :unprocessable_content
    end
  end

  protected

  # GET /api/images?album_id=&page=
  # GET /api/albums/:album_id/images?page=
  # Scoped to the current user; album-filtered when :album_id is present.
  # album raises RecordNotFound (→ 404) if the album doesn't exist or belongs
  # to another user, so no images from other users can ever leak.
  def resources
    scope = Image.with_user(current_user).order(created_at: :desc)
    scope = scope.where(album_id: album.id) if album
    scope.page(params[:page])
  end

  def album
    return nil unless params[:album_id]
    @album ||= Album.with_user(current_user).find(params[:album_id])
  end

  # Passes the presigned-URL credential to the serializer.
  # Presigning is a local crypto operation — no S3 network call is made per image.
  def serializer_params
    { credential: current_user.s3_credential }
  end

  def resource_class = Image
  def serializer = ImageSerializer
  def resource_params = params.require(:image).permit(:title, :description, :album_id, tags: [])
  def new_resource_params = resource_params.merge(user: current_user)
end
