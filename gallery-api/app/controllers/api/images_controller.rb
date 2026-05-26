class Api::ImagesController < ApplicationController
  include BaseApi

  before_action :authorize_resource!, only: %i[show destroy]

  # GET /api/images?album_id=
  # Overrides BaseApi#index to pass the credential so the serializer can embed
  # a presigned URL in each record. Presigning is a local crypto operation —
  # no S3 network call is made per image.
  def index
    render json: serializer.new(resources, params: { credential: current_user.s3_credential })
                           .serializable_hash.to_json
  end

  # GET /api/images/:id
  def show
    render json: serializer.new(resource, params: { credential: current_user.s3_credential })
                           .serializable_hash.to_json
  end

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
      render json: serializer.new(result.record, params: { credential: current_user.s3_credential })
                             .serializable_hash.to_json, status: :created
    else
      render json: { errors: result.error }, status: :unprocessable_content
    end
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

  # Scoped to the current user; optionally filtered by album.
  def resources
    scope = Image.with_user(current_user).order(created_at: :desc)
    scope = scope.where(album_id: params[:album_id]) if params[:album_id]
    scope
  end

  def model_name = Image
  def serializer = ImageSerializer
  def resource_params = params.require(:image).permit(:title, :album_id)
  def new_resource_params = resource_params.merge(user: current_user)
end
