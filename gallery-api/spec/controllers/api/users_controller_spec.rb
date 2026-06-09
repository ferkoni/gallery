require 'rails_helper'

RSpec.describe Api::UsersController, type: :controller do
  let(:valid_params) do
    { user: { email: 'newuser@example.com', password: 'password123', password_confirmation: 'password123' } }
  end

  context 'with valid params' do
    it 'creates a user' do
      expect {
        post :create, params: valid_params, as: :json
      }.to change(User, :count).by(1)
    end

    it 'returns http success' do
      post :create, params: valid_params, as: :json
      expect(response).to have_http_status(:ok)
    end

    it 'returns the user email' do
      post :create, params: valid_params, as: :json
      json = JSON.parse(response.body)
      expect(json.dig('data', 'attributes', 'email')).to eq('newuser@example.com')
    end

    it 'does not expose password data' do
      post :create, params: valid_params, as: :json
      expect(response.body).not_to include('password')
    end
  end

  context 'with a duplicate email' do
    before { create(:user, email: 'newuser@example.com') }

    it 'does not create a user' do
      expect {
        post :create, params: valid_params, as: :json
      }.not_to change(User, :count)
    end

    it 'returns 422 unprocessable entity' do
      post :create, params: valid_params, as: :json
      expect(response).to have_http_status(:unprocessable_content)
    end

    it 'returns an email error message' do
      post :create, params: valid_params, as: :json
      json = JSON.parse(response.body)
      expect(json.dig('errors', 'email')).to include('has already been taken')
    end
  end

  context 'with a missing password' do
    let(:invalid_params) do
      { user: { email: 'newuser@example.com', password: '', password_confirmation: '' } }
    end

    it 'does not create a user' do
      expect {
        post :create, params: invalid_params, as: :json
      }.not_to change(User, :count)
    end

    it 'returns 422 unprocessable entity' do
      post :create, params: invalid_params, as: :json
      expect(response).to have_http_status(:unprocessable_content)
    end

    it 'returns a password error message' do
      post :create, params: invalid_params, as: :json
      json = JSON.parse(response.body)
      expect(json.dig('errors', 'password')).to include("can't be blank")
    end
  end

  context 'with mismatched password confirmation' do
    let(:invalid_params) do
      { user: { email: 'newuser@example.com', password: 'password123', password_confirmation: 'different' } }
    end

    it 'does not create a user' do
      expect {
        post :create, params: invalid_params, as: :json
      }.not_to change(User, :count)
    end

    it 'returns 422 unprocessable entity' do
      post :create, params: invalid_params, as: :json
      expect(response).to have_http_status(:unprocessable_content)
    end

    it 'returns a password confirmation error message' do
      post :create, params: invalid_params, as: :json
      json = JSON.parse(response.body)
      expect(json.dig('errors', 'password_confirmation')).to include("doesn't match Password")
    end
  end

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
