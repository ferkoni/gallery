# Counts the SELECTs a block issues, for the handful of specs where "one query for the
# whole page" is the behaviour under test rather than an implementation detail.
module QueryCounting
  def count_selects
    queries = []
    subscriber = ActiveSupport::Notifications.subscribe("sql.active_record") do |*, payload|
      queries << payload[:sql] if payload[:sql].start_with?("SELECT", "WITH RECURSIVE")
    end
    yield
    queries
  ensure
    ActiveSupport::Notifications.unsubscribe(subscriber)
  end
end

RSpec.configure do |config|
  config.include QueryCounting
end
