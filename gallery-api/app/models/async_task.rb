class AsyncTask < ApplicationRecord
  include Userable

  enum :status, pending: "pending", processing: "processing", ready: "ready", failed: "failed"

  validates :user, presence: true
  validates :task_type, presence: true
end
