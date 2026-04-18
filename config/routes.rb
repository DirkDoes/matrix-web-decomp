Rails.application.routes.draw do
  get "up" => "rails/health#show", as: :rails_health_check

  devise_for :users, controllers: { omniauth_callbacks: "users/omniauth_callbacks" }

  namespace :settings do
    resources :users, only: [:index, :edit, :update, :destroy]
  end
  get "settings", to: redirect("/settings/users")

  root "landing#show"
  get "overview", to: "overview#show", as: :overview
end
