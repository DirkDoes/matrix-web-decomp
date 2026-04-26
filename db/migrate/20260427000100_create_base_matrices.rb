class CreateBaseMatrices < ActiveRecord::Migration[8.1]
  def change
    create_table :base_matrices do |t|
      t.references :user, null: false, foreign_key: true
      t.string :title, null: false
      t.integer :x_count, null: false
      t.integer :y_count, null: false
      t.integer :z_count, null: false
      t.jsonb :matrix, null: false, default: []

      t.timestamps
    end
  end
end
