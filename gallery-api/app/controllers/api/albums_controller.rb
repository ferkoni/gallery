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

  # Filter, then order, then paginate: a filtered list pages over the matches rather than
  # over the first page of everything. The order is explicit because without one Postgres
  # is free to return rows differently per page, so an infinite scroll can skip or repeat
  # a folder; id breaks ties between folders created in the same instant.
  def resources
    apply_filters(Album.with_user(current_user).order(created_at: :desc, id: :desc))
      .page(params[:page])
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
