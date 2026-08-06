class RenameReadyAsyncTaskStatusToCompleted < ActiveRecord::Migration[8.1]
  def up
    execute "UPDATE async_tasks SET status = 'completed' WHERE status = 'ready'"
  end

  def down
    execute "UPDATE async_tasks SET status = 'ready' WHERE status = 'completed'"
  end
end
