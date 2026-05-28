Rails.application.routes.draw do
  # Registers the Devise :user mapping so authenticate_user! / current_user are
  # available on controllers. skip: :all means no Devise-generated routes are added.
  devise_for :users, skip: :all
  # Define your application routes per the DSL in https://guides.rubyonrails.org/routing.html

  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  get "up" => "rails/health#show", as: :rails_health_check
  get "health" => "health#show"

  namespace :api do
    resources :albums, only: [ :index, :show, :create, :update, :destroy ] do
      resources :images, only: [ :index ]
    end
    resource :s3_credentials, only: [ :update, :destroy ]
    resources :images, only: [ :index, :show, :create, :update, :destroy ]

    resources :users, only: [ :create ] do
      collection do
        post :login
        delete :logout
      end
    end
  end
end
