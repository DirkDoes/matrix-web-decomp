class CreateDecompositions < ActiveRecord::Migration[8.1]
  def change
    create_table :decompositions do |t|
      t.references :user, null: false, foreign_key: true
      t.references :base_tensor, null: false, foreign_key: true
      t.string :name, null: false
      t.boolean :solved, null: false, default: false

      t.timestamps
    end
  end
end
