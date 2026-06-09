require "rails_helper"

RSpec.describe UserChannel, type: :channel do
  let(:user) { create(:user) }

  before { stub_connection current_user: user }

  it "confirms the subscription" do
    subscribe
    expect(subscription).to be_confirmed
  end

  it "streams from the user-scoped stream" do
    subscribe
    expect(subscription).to have_stream_from("user_#{user.id}")
  end

  it "does not stream from another user's stream" do
    other = create(:user)
    subscribe
    expect(subscription).not_to have_stream_from("user_#{other.id}")
  end
end
