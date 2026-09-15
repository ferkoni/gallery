Rails.application.routes.draw do
  mount ActionCable.server => "/cable"

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
      # "What is in this folder": exact, no subfolders. The flat /api/images?album_id= is
      # "search in this folder" and spans the subtree. Both set params[:album_id], so this
      # default is the only thing that tells Api::ImagesController#resources them apart.
      resources :images, only: [ :index ], defaults: { album_scope: "direct" }
    end
    resource :s3_credentials, only: [ :update, :destroy ]
    resources :async_tasks, only: [ :index, :show, :create ]
    resources :images, only: [ :index, :show, :create, :update, :destroy ]

    resources :users, only: [ :create ] do
      collection do
        post :login
        delete :logout
      end
    end
  end
end
