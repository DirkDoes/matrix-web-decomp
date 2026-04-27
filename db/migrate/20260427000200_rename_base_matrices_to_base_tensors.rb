class RenameBaseMatricesToBaseTensors < ActiveRecord::Migration[8.1]
  def change
    if table_exists?(:base_matrices)
      rename_table :base_matrices, :base_tensors
    end

    if column_exists?(:base_tensors, :matrix)
      rename_column :base_tensors, :matrix, :tensor
    end
  end
end
