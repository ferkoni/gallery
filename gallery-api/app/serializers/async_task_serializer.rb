class AsyncTaskSerializer
  include JSONAPI::Serializer

  attributes :task_type, :status, :payload, :result, :expires_at, :created_at
end
