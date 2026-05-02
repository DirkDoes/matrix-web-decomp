class LandingController < ApplicationController
  allow_unauthenticated_access

  def show
    redirect_to base_tensors_path if authenticated?
  end
end
