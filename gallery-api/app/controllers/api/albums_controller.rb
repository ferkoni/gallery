class Api::AlbumsController < ApplicationController
  include BaseApi

  before_action :authorize_resource!, only: [ :show, :create, :update, :destroy ]

  protected

  def resources
    Album.with_user(current_user)
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
