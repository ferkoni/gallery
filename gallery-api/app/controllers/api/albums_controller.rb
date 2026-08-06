class Api::AlbumsController < ApplicationController
  include BaseApi

  before_action :authorize_resource!, only: [ :show, :create, :update, :destroy ]

  # DELETE /api/albums/:id
  # Delegates to Images::AlbumDestroy, which batch-deletes all S3 objects
  # first and then destroys the album (cascading DB deletes). If the album
  # has no images, S3 is not touched. Missing credentials with images → 422.
  def destroy
    result = Images::AlbumDestroy.call(
      album: resource,
      storage: S3::Storage.for(current_user.s3_credential)
    )

    if result.success?
      head :no_content
    else
      render json: { errors: result.error }, status: :unprocessable_content
    end
  end

  protected

  def resources
    Album.with_user(current_user).page(params[:page])
  end

  def resource
    @_resource ||= params[:id] ? resources.find(params[:id]) : resources.build(new_resource_params)
  end

  def resource_params
    params.require(:album).permit(:name, :description)
  end

  def serializer = AlbumSerializer
  def new_resource_params = resource_params
end
