require "rails_helper"

RSpec.describe Album, type: :model do
  describe "validations" do
    it { should belong_to(:user) }
    it { should validate_presence_of(:user) }
    it { should validate_presence_of(:name) }
    it { should validate_length_of(:name).is_at_most(50) }
    it { should validate_length_of(:description).is_at_most(500) }
  end
end
