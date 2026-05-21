Rails.application.routes.draw do
  # Define your application routes per the DSL in https://guides.rubyonrails.org/routing.html

  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  get "up" => "rails/health#show", as: :rails_health_check
  get "health" => "health#show"

  devise_for :users

  namespace :api do
    resources :albums, only: [ :index, :show, :create, :update, :destroy ]

    resources :users, only: [ :create ] do
      collection do
        post :login
        delete :logout
      end
    end
  end
end
