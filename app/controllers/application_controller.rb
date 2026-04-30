class ApplicationController < ActionController::Base
  include Authentication

  # Only allow modern browsers supporting webp images, web push, badges, import maps, CSS nesting, and CSS :has.
  allow_browser versions: :modern

  # Changes to the importmap will invalidate the etag for HTML responses
  stale_when_importmap_changes

  before_action :configure_permitted_parameters, if: :devise_controller?
  before_action :ensure_default_owner_account!
  helper_method :overlay_flash_messages

  protected

  def after_sign_in_path_for(_resource)
    stored_location_for(:user) || overview_path
  end

  def after_sign_out_path_for(_resource_or_scope)
    root_path
  end

  def configure_permitted_parameters
    devise_parameter_sanitizer.permit(:sign_up, keys: [:name])
    devise_parameter_sanitizer.permit(:account_update, keys: [:name])
  end

  def ensure_default_owner_account!
    return unless User.table_exists?

    User.ensure_default_owner!
  rescue ActiveRecord::NoDatabaseError, ActiveRecord::StatementInvalid
    # Allow boot and setup tasks to run before the database is ready.
  end

  def overlay_flash_messages
    flash.each_with_object([]) do |(type, message), messages|
      next if message.blank? || type.to_s == "timedout"

      messages << {
        tone: flash_tone_for(type),
        message: Array(message).join(", ")
      }
    end
  end

  def flash_tone_for(type)
    case type.to_sym
    when :notice, :success
      "success"
    when :alert, :error
      "error"
    when :warning
      "warning"
    when :info
      "info"
    else
      "info"
    end
  end
end
