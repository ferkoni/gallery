require "rails_helper"

# The frontend posts a bare JSON body — {name, parent_id} — and ParamsWrapper is what turns
# it into params[:album]. Nothing else in the suite sends an unwrapped body, so a new
# column silently dropping out of the wrap would go unnoticed until a folder refused to be
# created in the right place.
RSpec.describe Api::AlbumsController, "parameter wrapping", type: :controller do
  let(:user) { create(:user) }

  before { sign_in user }

  it "files a new folder under the parent named in an unwrapped body" do
    parent = create(:album, user: user)

    post :create, body: { name: "Madrid", parent_id: parent.id }.to_json,
                  as: :json

    expect(JSON.parse(response.body).dig("data", "attributes", "parent_id")).to eq(parent.id)
  end
end
