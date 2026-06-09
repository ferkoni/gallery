require 'rails_helper'

RSpec.describe User, type: :model do
  subject { build(:user) }

  describe 'associations' do
    it { should have_one(:s3_credential).dependent(:destroy) }
  end

  describe 'validations' do
    it { should validate_presence_of(:email) }
    it { should validate_uniqueness_of(:email).case_insensitive }
    it { should validate_length_of(:password).is_at_least(6) }
  end

  describe 'jti' do
    let(:user) { create(:user) }

    it 'is present on a persisted user' do
      expect(user.jti).to be_present
    end

    it 'is unique across users' do
      other_user = create(:user)
      expect(user.jti).not_to eq(other_user.jti)
    end

    it 'can be rotated' do
      old_jti = user.jti
      user.update!(jti: SecureRandom.uuid)
      expect(user.reload.jti).not_to eq(old_jti)
    end
  end
end
