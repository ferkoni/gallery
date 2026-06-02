class Api::AsyncTasksController < ApplicationController
  include BaseApi

  ALLOWED_TASK_TYPES = %w[album_download].freeze

  VALIDATORS = {
    "album_download" => AsyncTasks::AlbumDownloadValidator
  }.freeze

  def create
    unless ALLOWED_TASK_TYPES.include?(task_type_param)
      return render json: { errors: "Unknown task_type" }, status: :unprocessable_content
    end

    result = VALIDATORS[task_type_param].call(user: current_user, payload: payload_param)
    return render json: { errors: result.error }, status: :unprocessable_content unless result.success?

    task = AsyncTask.create!(
      user: current_user,
      task_type: task_type_param,
      payload: payload_param,
      status: :pending
    )
    AlbumDownloadJob.perform_later(task.id)

    render json: { task_id: task.id }, status: :created
  end

  protected

  def resources
    AsyncTask.with_user(current_user).order(created_at: :desc)
  end

  def resource
    @_resource ||= AsyncTask.with_user(current_user).find(params[:id])
  end

  def serializer = AsyncTaskSerializer

  private

  def async_task_params
    params.require(:async_task).permit(:task_type, payload: {})
  end

  def task_type_param
    async_task_params[:task_type]
  end

  def payload_param
    async_task_params[:payload].to_h
  end
end
