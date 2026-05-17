require 'rails_helper'

RSpec.describe HealthController, type: :controller do
  describe 'GET #show' do
    context 'when the database is reachable' do
      it 'returns http ok' do
        get :show
        expect(response).to have_http_status(:ok)
      end

      it 'returns ok status' do
        get :show
        json = JSON.parse(response.body)
        expect(json['status']).to eq('ok')
      end

      it 'returns ok database status' do
        get :show
        json = JSON.parse(response.body)
        expect(json['database']).to eq('ok')
      end
    end

    context 'when the database is unreachable' do
      before do
        allow(ActiveRecord::Base.connection).to receive(:execute).and_raise(StandardError, 'connection refused')
      end

      it 'returns http service unavailable' do
        get :show
        expect(response).to have_http_status(:service_unavailable)
      end

      it 'returns error status' do
        get :show
        json = JSON.parse(response.body)
        expect(json['status']).to eq('error')
      end

      it 'returns the error message in database field' do
        get :show
        json = JSON.parse(response.body)
        expect(json['database']).to eq('connection refused')
      end
    end
  end
end
