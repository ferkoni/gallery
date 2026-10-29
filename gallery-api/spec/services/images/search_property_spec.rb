require "rails_helper"
require Rails.root.join("spec/support/inference/fake")

# A property test for the rule search must never break: whatever the library, the query,
# the strategy or the state of the sidecar, a user only ever gets their own photos back.
#
# The example specs in search_spec.rb check hand-picked cases. Here pbt generates the
# cases, so code cannot pass by special-casing inputs it was shown. On a failure pbt
# shrinks the case to the smallest one that still fails and prints its seed; rerun with
# `Pbt.assert(seed: ...)` to reproduce it.
#
# Constants defined inside an RSpec block land on Object, so they live in a module.
module SearchPropertyCases
  # A small shared vocabulary, so photos of different users often match the same query,
  # lexically through titles and tags, and semantically through equal embeddings.
  WORDS = %w[gato perro playa madrid].freeze
  USERS = 3

  # Real adapters only. Local points at a closed port, so every call to it fails with a
  # real connection error, which is the "sidecar down" case.
  ADAPTERS = {
    on: -> { Inference::Fake.new },
    off: -> { Inference::Null.new },
    failing: -> { Inference::Local.new(endpoint: "http://127.0.0.1:1", timeout: 1) }
  }.freeze
end

RSpec.describe Images::Search do
  photo = Pbt.fixed_hash(
    owner: Pbt.integer(min: 0, max: SearchPropertyCases::USERS - 1),
    title: Pbt.one_of(*SearchPropertyCases::WORDS),
    tags: Pbt.array(Pbt.one_of(*SearchPropertyCases::WORDS), max: 2),
    embedded_as: Pbt.one_of(nil, *SearchPropertyCases::WORDS)
  )

  library = Pbt.fixed_hash(
    photos: Pbt.array(photo, max: 8),
    searcher: Pbt.integer(min: 0, max: SearchPropertyCases::USERS - 1),
    query: Pbt.one_of(*SearchPropertyCases::WORDS),
    adapter: Pbt.one_of(*SearchPropertyCases::ADAPTERS.keys),
    strategy: Pbt.one_of(nil, *described_class::STRATEGIES)
  )

  # Each case writes its own rows inside a savepoint that is rolled back afterwards, so
  # cases do not see each other's photos. A failing expectation raises out of the
  # block, which rolls the savepoint back too and reaches pbt unchanged.
  def in_rolled_back_savepoint
    ActiveRecord::Base.transaction(requires_new: true) do
      yield
      raise ActiveRecord::Rollback
    end
  end

  def build_library(photos)
    fake = Inference::Fake.new
    users = Array.new(SearchPropertyCases::USERS) { create(:user) }

    photos.each_with_index do |spec, i|
      image = create(:image, user: users[spec[:owner]], title: "#{spec[:title]}-#{i}", tags: spec[:tags])
      next unless spec[:embedded_as]

      create(:image_embedding, image: image, model_id: fake.model_id,
                               dimensions: fake.dimensions,
                               embedding: fake.embed_text(spec[:embedded_as]).vector)
    end

    users
  end

  it "never returns another user's photo" do
    # Counts the cases that could have leaked: another user owned a photo and the search
    # returned something. Without this the property could pass on cases that never put
    # it to the test, such as a library with one user.
    tested_cases = 0

    Pbt.assert(num_runs: 100, worker: :none) do
      Pbt.property(library) do |photos:, searcher:, query:, adapter:, strategy:|
        in_rolled_back_savepoint do
          users = build_library(photos)
          searching = users[searcher]
          allow(Inference).to receive(:adapter).and_return(SearchPropertyCases::ADAPTERS.fetch(adapter).call)

          results = described_class.call(scope: Image.with_user(searching), query: query, strategy: strategy).to_a

          expect(results.map(&:user_id)).to all(eq(searching.id))

          others_have_photos = photos.any? { |p| p[:owner] != searcher }
          tested_cases += 1 if others_have_photos && results.any?
        end
      end
    end

    expect(tested_cases).to be >= 20
  end
end
