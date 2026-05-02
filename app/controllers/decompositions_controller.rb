class DecompositionsController < ApplicationController
  layout "settings"

  before_action :set_decomposition, only: [:show, :edit, :update, :destroy, :decompose, :duplicate, :update_ranks, :add_rank, :destroy_rank]
  before_action :set_base_tensors, only: [:new, :create, :edit, :update]

  def index
    @decompositions = current_user.decompositions.includes(:base_tensor, :ranks).order(updated_at: :desc)
  end

  def show
    redirect_to decompose_decomposition_path(@decomposition, selected_rank: "last")
  end

  def new
    @decomposition = current_user.decompositions.build(name: "Untitled decomposition")
  end

  def create
    @decomposition = current_user.decompositions.build(decomposition_params)

    if @decomposition.save
      redirect_to decompose_decomposition_path(@decomposition), notice: "Decomposition created."
    else
      render :new, status: :unprocessable_entity
    end
  end

  def edit
  end

  def update
    if @decomposition.update(decomposition_update_params)
      redirect_to decompose_decomposition_path(@decomposition), notice: "Decomposition updated."
    else
      render :edit, status: :unprocessable_entity
    end
  end

  def destroy
    @decomposition.destroy
    redirect_to decompositions_path, notice: "Decomposition deleted."
  end

  def duplicate
    duplicate = current_user.decompositions.create!(
      name: "#{@decomposition.name} copy",
      base_tensor: @decomposition.base_tensor
    )

    @decomposition.ranks.each_with_index do |rank, index|
      duplicate.ranks.create!(
        sequence: index + 1,
        label: rank.label,
        vectors: rank.vectors
      )
    end
    duplicate.refresh_solved!

    redirect_to decompose_decomposition_path(duplicate), notice: "Decomposition duplicated."
  end

  def decompose
    ensure_rank
  end

  def add_rank
    rank = nil

    ActiveRecord::Base.transaction do
      persist_rank_params!
      rank = @decomposition.ranks.create!
      @decomposition.refresh_solved!
    end

    redirect_to decompose_decomposition_path(@decomposition, selected_rank_id: rank.id)
  end

  def destroy_rank
    ActiveRecord::Base.transaction do
      persist_rank_params!
      @decomposition.ranks.find(params[:rank_id]).destroy
      resequence_ranks
      @decomposition.refresh_solved!
    end

    redirect_to decompose_decomposition_path(@decomposition)
  end

  def update_ranks
    ActiveRecord::Base.transaction do
      persist_rank_params!
      @decomposition.refresh_solved!
    end

    respond_to do |format|
      format.html { redirect_to decompositions_path, notice: "Ranks saved." }
      format.json { head :no_content }
    end
  end

  private

  def set_decomposition
    @decomposition = current_user.decompositions.find(params[:id])
  end

  def set_base_tensors
    @base_tensors = current_user.base_tensors.order(updated_at: :desc)
  end

  def decomposition_params
    params.require(:decomposition).permit(:name, :base_tensor_id)
  end

  def decomposition_update_params
    params.require(:decomposition).permit(:name)
  end

  def rank_params
    params.fetch(:ranks, {}).values.map do |rank|
      rank.permit(:id, :sequence, :label, :vectors)
    end
  end

  def sorted_rank_params
    rank_params.sort_by { |rank| rank[:sequence].to_i }
  end

  def persist_rank_params!
    sorted_rank_params.each do |rank_payload|
      rank = @decomposition.ranks.find(rank_payload[:id])
      rank.update_column(:sequence, -rank.id)
    end

    sorted_rank_params.each_with_index do |rank_payload, index|
      rank = @decomposition.ranks.find(rank_payload[:id])
      rank.update!(
        sequence: index + 1,
        label: normalized_rank_label(rank_payload[:label], index),
        vectors: parsed_vectors(rank_payload[:vectors])
      )
    end
  end

  def parsed_vectors(value)
    JSON.parse(value.presence || "{}")
  rescue JSON::ParserError
    {}
  end

  def normalized_rank_label(value, index)
    label = value.to_s.strip

    label.casecmp("Rank #{index + 1}").zero? ? nil : label.presence
  end

  def ensure_rank
    @decomposition.ranks.create! if @decomposition.ranks.empty?
  end

  def resequence_ranks
    @decomposition.ranks.reload.each_with_index do |rank, index|
      rank.update!(sequence: index + 1)
    end
  end
end
