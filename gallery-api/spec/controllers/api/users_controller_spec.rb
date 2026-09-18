require 'rails_helper'

RSpec.describe Api::UsersController, type: :controller do
  describe 'POST #login' do
    let(:user) { create(:user, email: 'user@example.com', password: 'password123') }

    context 'with valid credentials' do
      let(:login_params) { { user: { email: user.email, password: 'password123' } } }

      it 'returns http ok' do
        post :login, params: login_params, as: :json
        expect(response).to have_http_status(:ok)
      end

      it 'returns a token' do
        post :login, params: login_params, as: :json
        json = JSON.parse(response.body)
        expect(json['token']).to be_present
      end

      it 'returns the user data' do
        post :login, params: login_params, as: :json
        json = JSON.parse(response.body)
        expect(json.dig('user', 'data', 'attributes', 'email')).to eq(user.email)
      end

      it 'rotates the jti' do
        expect { post :login, params: login_params, as: :json }
          .to change { user.reload.jti }
      end

      it 'issues a token that matches the new jti' do
        post :login, params: login_params, as: :json
        token = JSON.parse(response.body)['token']
        payload = JWT.decode(token, Rails.application.secret_key_base, true, algorithms: [ 'HS256' ]).first
        expect(payload['jti']).to eq(user.reload.jti)
      end
    end

    context 'with invalid password' do
      let(:login_params) { { user: { email: user.email, password: 'wrongpassword' } } }

      it 'returns http unauthorized' do
        post :login, params: login_params, as: :json
        expect(response).to have_http_status(:unauthorized)
      end

      it 'returns an error message' do
        post :login, params: login_params, as: :json
        json = JSON.parse(response.body)
        expect(json['errors']).to include('Invalid email or password')
      end
    end

    context 'with a non-existent email' do
      let(:login_params) { { user: { email: 'nobody@example.com', password: 'password123' } } }

      it 'returns http unauthorized' do
        post :login, params: login_params, as: :json
        expect(response).to have_http_status(:unauthorized)
      end

      it 'returns an error message' do
        post :login, params: login_params, as: :json
        json = JSON.parse(response.body)
        expect(json['errors']).to include('Invalid email or password')
      end
    end
  end

  describe 'DELETE #logout' do
    let(:user) { create(:user) }

    before { sign_in user }

    it 'returns http no content' do
      delete :logout, as: :json
      expect(response).to have_http_status(:no_content)
    end

    it 'rotates the jti' do
      expect { delete :logout, as: :json }
        .to change { user.reload.jti }
    end
  end
end
