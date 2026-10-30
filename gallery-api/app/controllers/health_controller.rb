class HealthController < ApplicationController
  def show
    ActiveRecord::Base.connection.execute("SELECT 1")
    render json: { status: "up", database: "ok" }
  rescue StandardError => e
    render json: { status: "error", database: e.message }, status: :service_unavailable
  end
end
