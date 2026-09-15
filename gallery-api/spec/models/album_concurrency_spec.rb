require "rails_helper"

# The only spec in the suite that runs outside a transaction and on more than one
# connection. It has to: the thing under test is what two of one user's requests do to each
# other, and inside a single transactional connection there is no "each other".
#
# Everything it creates is deleted by hand, since the usual rollback does not happen.
RSpec.describe Album, "concurrent moves", type: :model do
  self.use_transactional_tests = false

  let!(:user) { create(:user) }
  let!(:a) { create(:album, user: user, name: "A") }
  let!(:b) { create(:album, user: user, name: "B") }

  after do
    Album.where(user_id: user.id).update_all(parent_id: nil)
    Album.where(user_id: user.id).delete_all
    User.where(id: user.id).delete_all
  end

  # Each move reads the tree to check for a cycle and then writes it. Unserialised, both
  # read a tree in which the other move has not happened, both pass, and the pair commits a
  # cycle: A under B under A, detached from every root, invisible to an index that selects
  # parent_id IS NULL and unreachable from anywhere.
  it "cannot put two folders underneath each other" do
    arrived = Queue.new
    go = Queue.new
    results = Queue.new

    threads = [ [ a, b ], [ b, a ] ].map do |album, new_parent|
      Thread.new do
        ActiveRecord::Base.connection_pool.with_connection do
          arrived << :here
          go.pop
          results << attempt_move(album.id, new_parent.id)
        end
      end
    end

    # Both threads hold a connection and are inside the block before either takes the lock,
    # which is the interleaving that used to be lost.
    2.times { arrived.pop }
    2.times { go << :now }
    threads.each(&:join)

    outcomes = [ results.pop, results.pop ]
    expect(outcomes).to contain_exactly(:ok, :rejected)
    expect(Album.where(id: [ a.id, b.id ]).pluck(:parent_id).compact.size).to eq(1)
  end

  # What Api::AlbumsController#update does, without the controller.
  def attempt_move(album_id, parent_id)
    Album.transaction do
      User.lock.find(user.id)
      Album.find(album_id).update!(parent_id: parent_id)
    end
    :ok
  rescue ActiveRecord::RecordInvalid
    :rejected
  end
end
