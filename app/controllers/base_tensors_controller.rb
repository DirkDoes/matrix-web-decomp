class BaseTensorsController < ApplicationController
  layout "settings"

  before_action :set_base_tensor, only: [:show, :edit, :update, :destroy]

  def index
    @base_tensors = current_user.base_tensors.order(updated_at: :desc)
  end

  def show
  end

  def new
    @base_tensor = current_user.base_tensors.build(
      title: "Untitled tensor",
      x_count: BaseTensor::DEFAULT_COUNT,
      y_count: BaseTensor::DEFAULT_COUNT,
      z_count: BaseTensor::DEFAULT_COUNT
    )
  end

  def create
    @base_tensor = current_user.base_tensors.build(base_tensor_params)

    if @base_tensor.save
      redirect_to base_tensor_path(@base_tensor), notice: "Tensor created."
    else
      render :new, status: :unprocessable_entity
    end
  end

  def edit
  end

  def update
    if @base_tensor.update(base_tensor_params)
      redirect_to base_tensors_path, notice: "Tensor updated."
    else
      render :edit, status: :unprocessable_entity
    end
  end

  def destroy
    @base_tensor.destroy
    redirect_to base_tensors_path, notice: "Tensor deleted."
  end

  def template_preview
    preview = BaseTensor.multiplication_template_tensor(
      a_rows: template_dimension(:a_rows),
      a_columns: template_dimension(:a_columns),
      b_rows: template_dimension(:b_rows),
      b_columns: template_dimension(:b_columns)
    )

    if preview
      render json: preview
    else
      render json: {
        x_count: 1,
        y_count: 1,
        z_count: 1,
        tensor: [[[-1]]]
      }
    end
  end

  private

  def set_base_tensor
    @base_tensor = current_user.base_tensors.find(params[:id])
  end

  def base_tensor_params
    permitted = params.require(:base_tensor).permit(:title, :x_count, :y_count, :z_count, :tensor)
    permitted[:tensor] = JSON.parse(permitted[:tensor]) if permitted[:tensor].is_a?(String)
    permitted
  rescue JSON::ParserError
    permitted[:tensor] = []
    permitted
  end

  def template_dimension(key)
    params.require(key).to_i.clamp(BaseTensor::MIN_COUNT, BaseTensor::MAX_COUNT)
  end
end
