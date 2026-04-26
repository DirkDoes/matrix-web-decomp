class BaseMatricesController < ApplicationController
  layout "settings"

  before_action :set_base_matrix, only: [:show, :edit, :update, :destroy]

  def index
    @base_matrices = current_user.base_matrices.order(updated_at: :desc)
  end

  def show
  end

  def new
    @base_matrix = current_user.base_matrices.build(
      title: "Untitled matrix",
      x_count: BaseMatrix::DEFAULT_COUNT,
      y_count: BaseMatrix::DEFAULT_COUNT,
      z_count: BaseMatrix::DEFAULT_COUNT
    )
  end

  def create
    @base_matrix = current_user.base_matrices.build(base_matrix_params)

    if @base_matrix.save
      redirect_to base_matrix_path(@base_matrix), notice: "Matrix created."
    else
      render :new, status: :unprocessable_entity
    end
  end

  def edit
  end

  def update
    if @base_matrix.update(base_matrix_params)
      redirect_to base_matrices_path, notice: "Matrix updated."
    else
      render :edit, status: :unprocessable_entity
    end
  end

  def destroy
    @base_matrix.destroy
    redirect_to base_matrices_path, notice: "Matrix deleted."
  end

  private

  def set_base_matrix
    @base_matrix = current_user.base_matrices.find(params[:id])
  end

  def base_matrix_params
    params.require(:base_matrix).permit(:title, :x_count, :y_count, :z_count)
  end
end
