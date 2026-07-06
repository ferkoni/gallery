class DropSolidQueueTables < ActiveRecord::Migration[8.1]
  # Solid Queue was removed (production uses amazon_sqs, development uses the
  # async adapter). In development its tables were created in the primary
  # database, so drop them here to keep the schema clean.
  def up
    # Execution tables reference solid_queue_jobs; drop them first.
    drop_table :solid_queue_blocked_executions, if_exists: true, force: :cascade
    drop_table :solid_queue_claimed_executions, if_exists: true, force: :cascade
    drop_table :solid_queue_failed_executions, if_exists: true, force: :cascade
    drop_table :solid_queue_ready_executions, if_exists: true, force: :cascade
    drop_table :solid_queue_recurring_executions, if_exists: true, force: :cascade
    drop_table :solid_queue_scheduled_executions, if_exists: true, force: :cascade

    drop_table :solid_queue_jobs, if_exists: true, force: :cascade

    drop_table :solid_queue_pauses, if_exists: true, force: :cascade
    drop_table :solid_queue_processes, if_exists: true, force: :cascade
    drop_table :solid_queue_recurring_tasks, if_exists: true, force: :cascade
    drop_table :solid_queue_semaphores, if_exists: true, force: :cascade
  end

  def down
    raise ActiveRecord::IrreversibleMigration
  end
end
