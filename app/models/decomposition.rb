class Decomposition < ApplicationRecord
  belongs_to :user
  belongs_to :base_tensor
  has_many :ranks, -> { order(:sequence) }, dependent: :destroy

  validates :name, presence: true
  validate :base_tensor_must_belong_to_user

  before_validation :set_default_name

  def refresh_solved!
    update!(solved: solved_by_ranks?)
  end

  def solved_by_ranks?
    return false if ranks.empty?

    decomposed_tensor.flatten.all?(&:zero?)
  end

  def decomposed_tensor
    remaining = base_tensor.tensor.deep_dup

    ranks.each do |rank|
      rank.rank_changes(base_tensor).each do |(x, y, z), value|
        remaining[z][y][x] = (remaining[z][y][x].to_i + value).clamp(-1, 1)
      end
    end

    remaining
  end

  private

  def set_default_name
    self.name = "Untitled decomposition" if name.blank?
  end

  def base_tensor_must_belong_to_user
    return if user.blank? || base_tensor.blank?
    return if base_tensor.user_id == user_id

    errors.add(:base_tensor, "must belong to you")
  end
end
