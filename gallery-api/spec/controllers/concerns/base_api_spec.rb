require 'rails_helper'

RSpec.describe BaseApi, type: :controller do
  controller(ApplicationController) do
    include BaseApi

    def model_name
      User
    end

    def serializer
      UserSerializer
    end

    def resource_params
      params.require(:user).permit(:email)
    end

    def new_resource_params
      params.require(:user).permit(:email, :password, :password_confirmation)
    end
  end

  describe 'authentication' do
    it 'calls authenticate_user! before each action' do
      expect(controller).to receive(:authenticate_user!)
      get :index
    end
  end

  describe 'authenticated actions' do
    let(:user) { create(:user) }

    before { allow(controller).to receive(:authenticate_user!).and_return(true) }

    describe 'GET #index' do
      let!(:users) { create_list(:user, 3) }

      it 'returns http ok' do
        get :index
        expect(response).to have_http_status(:ok)
      end

      it 'returns all records' do
        get :index
        json = JSON.parse(response.body)
        expect(json['data'].length).to eq(3)
      end
    end

    describe 'GET #show' do
      it 'returns http ok' do
        get :show, params: { id: user.id }
        expect(response).to have_http_status(:ok)
      end

      it 'returns the record' do
        get :show, params: { id: user.id }
        json = JSON.parse(response.body)
        expect(json.dig('data', 'attributes', 'email')).to eq(user.email)
      end
    end

    describe 'POST #create' do
      let(:valid_params) do
        { user: { email: 'new@example.com', password: 'password123', password_confirmation: 'password123' } }
      end

      it 'creates a record' do
        expect {
          post :create, params: valid_params
        }.to change(User, :count).by(1)
      end

      it 'returns http ok' do
        post :create, params: valid_params
        expect(response).to have_http_status(:ok)
      end

      it 'returns the created record' do
        post :create, params: valid_params
        json = JSON.parse(response.body)
        expect(json.dig('data', 'attributes', 'email')).to eq('new@example.com')
      end

      context 'when record is invalid' do
        let(:invalid_params) { { user: { email: '', password: '', password_confirmation: '' } } }

        it 'returns 422 unprocessable entity' do
          post :create, params: invalid_params
          expect(response).to have_http_status(:unprocessable_content)
        end

        it 'returns error messages' do
          post :create, params: invalid_params
          json = JSON.parse(response.body)
          expect(json['errors']).to be_present
        end
      end
    end

    describe 'GET #show' do
      context 'when record does not exist' do
        it 'returns http not found' do
          get :show, params: { id: 0 }
          expect(response).to have_http_status(:not_found)
        end

        it 'returns an error message' do
          get :show, params: { id: 0 }
          json = JSON.parse(response.body)
          expect(json['errors']).to be_present
        end
      end
    end

    describe 'PATCH #update' do
      it 'updates the record' do
        patch :update, params: { id: user.id, user: { email: 'updated@example.com' } }
        expect(user.reload.email).to eq('updated@example.com')
      end

      it 'returns http ok' do
        patch :update, params: { id: user.id, user: { email: 'updated@example.com' } }
        expect(response).to have_http_status(:ok)
      end

      it 'returns the updated record' do
        patch :update, params: { id: user.id, user: { email: 'updated@example.com' } }
        json = JSON.parse(response.body)
        expect(json.dig('data', 'attributes', 'email')).to eq('updated@example.com')
      end
    end

    describe 'DELETE #destroy' do
      it 'destroys the record' do
        user.touch
        expect {
          delete :destroy, params: { id: user.id }
        }.to change(User, :count).by(-1)
      end

      it 'returns http no content' do
        delete :destroy, params: { id: user.id }
        expect(response).to have_http_status(:no_content)
      end
    end
  end
end
