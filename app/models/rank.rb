class Rank < ApplicationRecord
  VECTOR_AXES = %w[x y z].freeze

  belongs_to :decomposition

  validates :sequence, presence: true, numericality: { only_integer: true, greater_than_or_equal_to: 1 }
  validates :sequence, uniqueness: { scope: :decomposition_id }

  before_validation :set_default_sequence, on: :create
  before_validation :normalize_vectors

  def display_name
    label.presence || "Rank #{sequence}"
  end

  def marked_tensor_indices(base_tensor)
    rank_changes(base_tensor).keys
  end

  def rank_changes(base_tensor)
    x_values = vector_values("x", base_tensor.x_count)
    y_values = vector_values("y", base_tensor.y_count)
    z_values = vector_values("z", base_tensor.z_count)
    changes = {}

    z_values.each_with_index do |z_value, z|
      next if z_value.zero?

      y_values.each_with_index do |y_value, y|
        next if y_value.zero?

        x_values.each_with_index do |x_value, x|
          next if x_value.zero?

          value = x_value * y_value * z_value

          changes[[x, y, z]] = value unless value.zero?
        end
      end
    end

    changes
  end

  private

  def set_default_sequence
    self.sequence ||= (decomposition&.ranks&.maximum(:sequence) || 0) + 1
  end

  def normalize_vectors
    self.vectors = VECTOR_AXES.index_with do |axis|
      Array(vectors&.[](axis)).map { |value| normalize_vector_value(value) }
    end
  end

  def vector_values(axis, count)
    values = Array(vectors&.[](axis))

    Array.new(count) { |index| normalize_vector_value(values[index]) }
  end

  def normalize_vector_value(value)
    number = value.to_i

    return 1 if number.positive?
    return -1 if number.negative?

    0
  end
end
