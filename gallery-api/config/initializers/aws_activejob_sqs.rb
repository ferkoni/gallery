# SQS queue configuration for production Active Job.
#
# Infrastructure requirement: each queue listed here must have a RedrivePolicy
# with maxReceiveCount: 3 and a dead-letter queue so that messages that fail
# three delivery attempts are routed to the DLQ rather than retried indefinitely.
#
# Development uses Solid Queue, which mirrors this retry count via
# `retry_on StandardError, attempts: 3` in each job class.

if Rails.env.production?
  Aws::ActiveJob::SQS.configure do |config|
    config.queues = {
      default: ENV.fetch("SQS_DEFAULT_QUEUE_URL")
    }
  end
end
