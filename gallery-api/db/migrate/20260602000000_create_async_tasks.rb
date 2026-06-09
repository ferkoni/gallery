class CreateAsyncTasks < ActiveRecord::Migration[8.1]
  def change
    create_table :async_tasks do |t|
      t.references :user, null: false, foreign_key: true
      t.string :task_type, null: false
      t.string :status, null: false, default: "pending"
      t.jsonb :payload, null: false, default: {}
      t.jsonb :result, null: false, default: {}
      t.datetime :expires_at

      t.timestamps
    end

    add_index :async_tasks, [ :user_id, :created_at ]
  end
end
