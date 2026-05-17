module BaseApi
  extend ActiveSupport::Concern

  included do
    before_action :authenticate_user!

    rescue_from ActiveRecord::RecordInvalid, with: :render_unprocessable_entity_response
  end

  def index
    render json: serializer.new(resources).serializable_hash.to_json
  end

  def show
    render json: serializer.new(resource).serializable_hash.to_json
  end

  def create
    resource.save!
    render json: serializer.new(resource).serializable_hash.to_json
  end

  def update
    resource.update!(resource_params)
    render json: serializer.new(resource).serializable_hash.to_json
  end

  def destroy
    resource.destroy!
    render json: {}, status: :no_content
  end

  protected
  def resources
    model_name.all
  end

  def resource
    @_resource ||= params[:id] ? model_name.find(params[:id]) : model_name.new(new_resource_params)
  end

  def render_unprocessable_entity_response
    render json: { errors: resource.errors }, status: :unprocessable_content
  end

  def model_name
    raise NotImplementedError
  end

  def serializer
    raise NotImplementedError
  end

  def resource_params
    raise NotImplementedError
  end

  def new_resource_params
    raise NotImplementedError
  end
end
