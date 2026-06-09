require "rails_helper"

RSpec.describe Userable, type: :model do
  subject(:model) { Album }

  describe ".with_user" do
    let(:user) { create(:user) }
    let(:other_user) { create(:user) }

    it "returns records belonging to the given user" do
      own = create_list(:album, 2, user: user)
      create(:album, user: other_user)

      expect(model.with_user(user)).to match_array(own)
    end

    it "excludes records belonging to other users" do
      create(:album, user: other_user)

      expect(model.with_user(user)).to be_empty
    end
  end
end
