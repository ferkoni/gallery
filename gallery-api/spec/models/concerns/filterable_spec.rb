require "rails_helper"

RSpec.describe Filterable, type: :model do
  subject(:model) { Image }

  let(:user) { create(:user) }
  let(:album) { create(:album, user: user) }

  describe ".from_date" do
    it "includes records created on or after the given date" do
      recent = create(:image, user: user, album: album, created_at: Time.current)
      expect(model.from_date(Date.yesterday.to_s)).to include(recent)
    end

    it "excludes records created before the given date" do
      old = create(:image, user: user, album: album, created_at: 3.days.ago)
      expect(model.from_date(Date.yesterday.to_s)).not_to include(old)
    end

    it "includes records created exactly on the given date" do
      exact = create(:image, user: user, album: album, created_at: Date.today.beginning_of_day)
      expect(model.from_date(Date.today.to_s)).to include(exact)
    end
  end
end
