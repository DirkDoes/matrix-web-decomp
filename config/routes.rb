Rails.application.routes.draw do
  get "up" => "rails/health#show", as: :rails_health_check

  devise_for :users, controllers: { omniauth_callbacks: "users/omniauth_callbacks" }

  namespace :settings do
    resources :users, only: [:index, :edit, :update, :destroy]
  end
  get "settings", to: redirect("/settings/users")

  root "landing#show"
  resources :base_tensors, path: "tensors" do
    post :template_preview, on: :collection
  end
  resources :decompositions do
    member do
      get :decompose
      post :duplicate
      patch :update_ranks
      match :add_rank, via: [:post, :patch]
      delete "ranks/:rank_id", to: "decompositions#destroy_rank", as: :rank
    end
  end
end
