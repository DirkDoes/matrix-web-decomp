class BaseMatrix < ApplicationRecord
  belongs_to :user

  DEFAULT_COUNT = 3
  MIN_COUNT = 1
  MAX_COUNT = 8

  validates :title, presence: true
  validates :x_count, :y_count, :z_count,
    numericality: { only_integer: true, greater_than_or_equal_to: MIN_COUNT, less_than_or_equal_to: MAX_COUNT }

  before_validation :set_defaults
  before_validation :build_matrix

  def size_label
    "#{x_count} • #{y_count} • #{z_count}"
  end

  private

  def set_defaults
    self.title = "Untitled matrix" if title.blank?
    self.x_count ||= DEFAULT_COUNT
    self.y_count ||= DEFAULT_COUNT
    self.z_count ||= DEFAULT_COUNT
  end

  def build_matrix
    return if [x_count, y_count, z_count].any?(&:blank?)
    return if matrix.present? && !matrix_dimensions_changed?

    self.matrix = Array.new(z_count) do
      Array.new(y_count) do
        Array.new(x_count, 0)
      end
    end
  end

  def matrix_dimensions_changed?
    will_save_change_to_x_count? || will_save_change_to_y_count? || will_save_change_to_z_count?
  end
end
