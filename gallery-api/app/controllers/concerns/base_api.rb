module BaseApi
  extend ActiveSupport::Concern

  included do
    before_action :authenticate_user!

    rescue_from ActiveRecord::RecordInvalid, with: :render_unprocessable_entity_response
    rescue_from ActiveRecord::RecordNotFound, with: :render_not_found_response
    rescue_from Pundit::NotAuthorizedError, with: :render_forbidden_response
  end

  def index
    collection = resources
    hash = serializer.new(collection, params: serializer_params).serializable_hash
    hash[:meta] = pagination_meta(collection) if collection.respond_to?(:current_page)
    render json: hash.to_json
  end

  def show
    render json: serializer.new(resource, params: serializer_params).serializable_hash.to_json
  end

  def create
    resource.save!
    render json: serializer.new(resource, params: serializer_params).serializable_hash.to_json
  end

  def update
    resource.update!(resource_params)
    render json: serializer.new(resource, params: serializer_params).serializable_hash.to_json
  end

  def destroy
    resource.destroy!
    render json: {}, status: :no_content
  end

  protected

  def authorize_resource!
    authorize(resource)
  end

  # Returns a paginated scope by default. Override without .page to opt out.
  def resources
    model_name.all.page(params[:page])
  end

  def resource
    @_resource ||= params[:id] ? model_name.find(params[:id]) : model_name.new(new_resource_params)
  end

  # Override in controllers that need extra serializer options (e.g. credentials).
  def serializer_params
    {}
  end

  def pagination_meta(paged)
    {
      current_page: paged.current_page,
      total_pages: paged.total_pages,
      total_count: paged.total_count,
      per_page: paged.limit_value
    }
  end

  def render_unprocessable_entity_response
    render json: { errors: resource.errors }, status: :unprocessable_content
  end

  def render_not_found_response
    render json: { errors: "Not found" }, status: :not_found
  end

  def render_forbidden_response
    render json: { errors: "Forbidden" }, status: :forbidden
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
