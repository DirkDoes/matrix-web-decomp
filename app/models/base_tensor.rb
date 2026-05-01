class BaseTensor < ApplicationRecord
  belongs_to :user

  DEFAULT_COUNT = 3
  MIN_COUNT = 1
  MAX_COUNT = 50

  validates :title, presence: true
  validates :x_count, :y_count, :z_count,
    numericality: { only_integer: true, greater_than_or_equal_to: MIN_COUNT, less_than_or_equal_to: MAX_COUNT }

  before_validation :set_defaults
  before_validation :build_tensor
  before_validation :normalize_tensor

  def size_label
    "#{x_count} • #{y_count} • #{z_count}"
  end

  private

  def set_defaults
    self.title = "Untitled tensor" if title.blank?
    self.x_count ||= DEFAULT_COUNT
    self.y_count ||= DEFAULT_COUNT
    self.z_count ||= DEFAULT_COUNT
  end

  def build_tensor
    return if [x_count, y_count, z_count].any?(&:blank?)
    return if tensor.present?

    self.tensor = self.class.blank_tensor(x_count, y_count, z_count)
  end

  def normalize_tensor
    return if [x_count, y_count, z_count].any?(&:blank?)

    self.tensor = self.class.normalize_tensor(tensor, x_count, y_count, z_count)
  end

  def self.blank_tensor(x_count, y_count, z_count)
    Array.new(z_count) do
      Array.new(y_count) do
        Array.new(x_count, 0)
      end
    end
  end

  def self.normalize_tensor(value, x_count, y_count, z_count)
    source = value.is_a?(Array) ? value : []

    Array.new(z_count) do |z|
      Array.new(y_count) do |y|
        Array.new(x_count) do |x|
          source.dig(z, y, x).to_i.clamp(-1, 1)
        end
      end
    end
  end

  def self.multiplication_template_tensor(a_rows:, a_columns:, b_rows:, b_columns:)
    return nil unless a_columns == b_rows

    x_count = a_rows * b_columns
    y_count = a_rows * a_columns
    z_count = b_rows * b_columns
    return nil if [x_count, y_count, z_count].any? { |count| count > MAX_COUNT }

    tensor = blank_tensor(x_count, y_count, z_count)

    a_rows.times do |row|
      b_columns.times do |column|
        a_columns.times do |inner|
          result_index = row * b_columns + column
          a_index = row * a_columns + inner
          b_index = inner * b_columns + column

          tensor[b_index][a_index][result_index] = 1
        end
      end
    end

    { x_count:, y_count:, z_count:, tensor: }
  end

end
