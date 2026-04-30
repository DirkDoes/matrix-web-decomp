class RemoveThemePreferenceFromUsers < ActiveRecord::Migration[8.1]
  def up
    remove_column :users, :theme_preference
  end

  def down
    add_column :users, :theme_preference, :string, null: false, default: "system"
  end
end
