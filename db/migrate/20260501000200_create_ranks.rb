class CreateRanks < ActiveRecord::Migration[8.1]
  def change
    create_table :ranks do |t|
      t.references :decomposition, null: false, foreign_key: true
      t.integer :sequence, null: false
      t.string :label
      t.jsonb :vectors, null: false, default: {}

      t.timestamps
    end

    add_index :ranks, [:decomposition_id, :sequence], unique: true
  end
end
