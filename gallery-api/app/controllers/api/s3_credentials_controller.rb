class Api::S3CredentialsController < ApplicationController
  include BaseApi

  before_action :authorize_resource!, only: [ :update, :destroy ]

  # PUT /api/s3_credentials — create or update (upsert)
  def update
    resource.assign_attributes(resource_params)
    resource.save!
    head :no_content
  end

  # DELETE /api/s3_credentials
  def destroy
    raise ActiveRecord::RecordNotFound unless resource.persisted?
    resource.destroy!
    head :no_content
  end

  protected

  # Singleton: no params[:id] — find the user's credential or build a new one
  def resource
    @_resource ||= current_user.s3_credential || current_user.build_s3_credential
  end

  def resource_class = S3Credential
  def serializer = nil  # never called: update returns 204, destroy returns 204
  def resource_params
    params.require(:s3_credential).permit(:access_key_id, :secret_access_key, :region, :bucket)
  end
  def new_resource_params = resource_params
end
