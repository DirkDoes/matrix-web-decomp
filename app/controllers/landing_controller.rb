class LandingController < ApplicationController
  allow_unauthenticated_access

  def show
    redirect_to overview_path if authenticated?
  end
end
