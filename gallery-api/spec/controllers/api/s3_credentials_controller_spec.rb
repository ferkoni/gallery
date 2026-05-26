require "rails_helper"

RSpec.describe Api::S3CredentialsController, type: :controller do
  # Stub reachability so saves don't make real AWS calls.
  before { allow_any_instance_of(S3Credential).to receive(:reachable?).and_return(true) }

  let(:user)       { create(:user) }
  let(:other_user) { create(:user) }

  let(:valid_params) do
    {
      s3_credential: {
        access_key_id:     "AKIAIOSFODNN7EXAMPLE",
        secret_access_key: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        region:            "us-east-1",
        bucket:            "my-gallery-bucket"
      }
    }
  end

  describe "PUT #update" do
    context "when signed in" do
      before { sign_in user }

      context "when no credential exists" do
        it "returns http no content" do
          put :update, params: valid_params, as: :json
          expect(response).to have_http_status(:no_content)
        end

        it "creates a credential scoped to the current user" do
          expect { put :update, params: valid_params, as: :json }
            .to change { user.reload.s3_credential }.from(nil)
        end

        it "saves the region and bucket" do
          put :update, params: valid_params, as: :json
          cred = user.reload.s3_credential
          expect(cred.region).to eq("us-east-1")
          expect(cred.bucket).to eq("my-gallery-bucket")
        end
      end

      context "when a credential already exists" do
        let!(:credential) { create(:s3_credential, user: user, region: "eu-west-1") }

        it "returns http no content" do
          put :update, params: valid_params, as: :json
          expect(response).to have_http_status(:no_content)
        end

        it "updates the existing credential instead of creating a new one" do
          expect { put :update, params: valid_params, as: :json }
            .not_to change { S3Credential.count }
        end

        it "updates the region" do
          put :update, params: valid_params, as: :json
          expect(credential.reload.region).to eq("us-east-1")
        end
      end

      context "with a blank required field" do
        it "returns http unprocessable content" do
          put :update, params: { s3_credential: valid_params[:s3_credential].merge(region: "") }, as: :json
          expect(response).to have_http_status(:unprocessable_content)
        end

        it "does not create a credential" do
          expect { put :update, params: { s3_credential: valid_params[:s3_credential].merge(region: "") }, as: :json }
            .not_to change { S3Credential.count }
        end
      end
    end

    context "without a token" do
      it "returns http unauthorized" do
        put :update, params: valid_params, as: :json
        expect(response).to have_http_status(:unauthorized)
      end
    end
  end

  describe "DELETE #destroy" do
    context "when signed in" do
      before { sign_in user }

      context "when a credential exists" do
        let!(:credential) { create(:s3_credential, user: user) }

        it "returns http no content" do
          delete :destroy, as: :json
          expect(response).to have_http_status(:no_content)
        end

        it "destroys the credential" do
          expect { delete :destroy, as: :json }
            .to change { S3Credential.count }.by(-1)
        end

        it "does not affect other users' credentials" do
          other_cred = create(:s3_credential, user: other_user)
          delete :destroy, as: :json
          expect(other_cred.reload).to be_persisted
        end
      end

      context "when no credential exists" do
        it "returns http not found" do
          delete :destroy, as: :json
          expect(response).to have_http_status(:not_found)
        end
      end
    end

    context "without a token" do
      it "returns http unauthorized" do
        delete :destroy, as: :json
        expect(response).to have_http_status(:unauthorized)
      end
    end
  end
end
