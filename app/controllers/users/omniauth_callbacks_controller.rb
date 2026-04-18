class Users::OmniauthCallbacksController < Devise::OmniauthCallbacksController
  include Devise::Controllers::Rememberable

  def google_oauth2
    auth = request.env["omniauth.auth"]

    unless verified_google_email?(auth)
      redirect_to new_user_session_path, alert: "Google did not return a verified email address."
      return
    end

    @user = User.from_omniauth(auth)

    if @user.persisted?
      remember_me(@user)
      sign_in_and_redirect @user, event: :authentication
      set_flash_message(:notice, :success, kind: "Google") if is_navigational_format?
    else
      redirect_to new_user_session_path, alert: "Google did not return a usable account."
    end
  end

  def failure
    redirect_to new_user_session_path, alert: "Google sign-in was cancelled or failed."
  end

  private

  def verified_google_email?(auth)
    return false if auth.info.email.blank?

    verified = auth.extra&.raw_info&.email_verified
    verified = auth.extra&.id_info&.email_verified if verified.nil?

    verified.nil? || ActiveModel::Type::Boolean.new.cast(verified)
  end
end
