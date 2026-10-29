require "rails_helper"
require Rails.root.join("spec/support/inference/fake")

RSpec.describe Images::Search do
  let(:user) { create(:user) }
  let(:album) { create(:album, user: user) }
  let(:scope) { Image.with_user(user) }

  def image(title, s3_key: nil)
    create(:image, user: user, album: album, title: title, s3_key: s3_key || "uploads/#{SecureRandom.uuid}/x.jpg")
  end

  # A unit vector pointing mostly along one axis, so "closest to axis n" is decidable
  # without knowing anything about CLIP.
  def vector_towards(axis)
    width = ImageEmbedding.column_dimensions
    raw = Array.new(width, 0.01)
    raw[axis] = 1.0
    norm = Math.sqrt(raw.sum { |x| x * x })
    raw.map { |x| x / norm }
  end

  def embed(image, axis, model_id: "clip-vit-b-32/openai/v1")
    create(:image_embedding, image: image, model_id: model_id, embedding: vector_towards(axis))
  end

  # An adapter that is available and returns a chosen query vector.
  def adapter_returning(axis, model_id: "clip-vit-b-32/openai/v1")
    instance_double(Inference::Local, available?: true, model_id: model_id,
                    embed_text: Inference::Embedding.new(
                      vector: vector_towards(axis), model_id: model_id,
                      dimensions: ImageEmbedding.column_dimensions))
  end

  def search(query) = described_class.call(scope: scope, query: query)

  describe "with inference switched off" do
    before { allow(Inference).to receive(:adapter).and_return(Inference::Null.new) }

    # The regression test that matters most: a self-hosted install that never turns on
    # AI must behave exactly as it did before 07 shipped.
    it "answers from lexical search alone" do
      match = image("gato-teclado")
      image("torta")

      expect(search("gato")).to contain_exactly(match)
    end

    it "returns nothing for a query that matches no title" do
      image("gato-teclado")
      expect(search("un gato en el teclado")).to be_empty
    end

    it "returns nothing for a blank query without calling the adapter" do
      image("gato-teclado")
      expect(search("  ")).to be_empty
    end
  end

  describe "when the sidecar fails mid-request" do
    before do
      adapter = instance_double(Inference::Local, available?: true, model_id: "clip-vit-b-32/openai/v1")
      allow(adapter).to receive(:embed_text).and_raise(Inference::Unavailable, "connection refused")
      allow(Inference).to receive(:adapter).and_return(adapter)
    end

    # A sidecar restarting to load new weights must degrade search to "temporarily
    # less clever", never to a 500.
    it "falls back to lexical rather than raising" do
      match = image("gato-teclado")
      expect { search("gato") }.not_to raise_error
      expect(search("gato")).to contain_exactly(match)
    end
  end

  describe "hybrid retrieval" do
    it "finds a photo whose title says nothing, via its vector" do
      semantic_hit = image("IMG_4471")
      embed(semantic_hit, 0)
      allow(Inference).to receive(:adapter).and_return(adapter_returning(0))

      expect(search("un gato en el teclado")).to include(semantic_hit)
    end

    it "keeps a lexical-only match that semantic never ranked" do
      lexical_hit = image("gato-teclado")   # no embedding at all
      allow(Inference).to receive(:adapter).and_return(adapter_returning(0))

      expect(search("gato")).to include(lexical_hit)
    end

    # RRF's defining property: agreement across strategies beats one strong opinion.
    it "ranks a photo both strategies found above one only semantic found" do
      both = image("gato-teclado")
      semantic_only = image("IMG_0001")
      embed(both, 1)          # slightly further from the query axis
      embed(semantic_only, 0) # nearest neighbour

      allow(Inference).to receive(:adapter).and_return(adapter_returning(0))

      expect(search("gato").to_a).to eq([ both, semantic_only ])
    end

    # Without the model_id filter, vectors from a previous model join in and rank
    # against the current query: plausible results, wrong answers.
    it "ignores embeddings written by a different model" do
      stale = image("IMG_9999")
      embed(stale, 0, model_id: "clip-vit-b-16/laion2b_s34b_b88k/v1")

      allow(Inference).to receive(:adapter).and_return(adapter_returning(0))

      expect(search("un gato")).to be_empty
    end

    it "never returns another user's photos" do
      intruder = create(:image, user: create(:user), title: "gato-ajeno")
      create(:image_embedding, image: intruder, model_id: "clip-vit-b-32/openai/v1",
                               embedding: vector_towards(0))

      allow(Inference).to receive(:adapter).and_return(adapter_returning(0))

      expect(search("gato")).not_to include(intruder)
    end

    # The controller hands in a scope already ordered newest first. Appending the ranking
    # to that order let created_at decide and the ranking only break ties, so a page of
    # results was the newest candidates rather than the best ones.
    it "ranks by relevance even when the scope arrives already ordered" do
      best = image("IMG_0001")
      worse = image("IMG_0002")
      embed(best, 0)
      embed(worse, 1)
      best.update!(created_at: 2.days.ago)

      allow(Inference).to receive(:adapter).and_return(adapter_returning(0))

      result = described_class.call(scope: scope.order(created_at: :desc), query: "un gato")
      expect(result.to_a).to eq([ best, worse ])
    end

    it "returns a relation the caller can keep chaining" do
      match = image("gato-teclado")
      embed(match, 0)
      allow(Inference).to receive(:adapter).and_return(adapter_returning(0))

      expect(search("gato").where(favorited: true)).to be_empty
    end
  end

  describe "fusion arithmetic" do
    it "scores agreement above a single first place" do
      fuse = described_class.new(scope: scope, query: "x").send(:fuse, [ 1, 2, 3 ], [ 9, 8, 3 ])
      # 3 is third in both: 2/63 = 0.0317. 1 and 9 are first in one: 1/61 = 0.0164.
      expect(fuse.first).to eq(3)
    end

    it "is deterministic when scores tie" do
      service = described_class.new(scope: scope, query: "x")
      expect(service.send(:fuse, [ 5, 2 ], [])).to eq([ 5, 2 ])
      expect(service.send(:fuse, [ 2 ], [ 5 ])).to eq([ 2, 5 ])
    end

    # The tie above happens to list 2 first, so it passes even with no id tiebreaker.
    it "breaks a tie by id whatever order the lists give" do
      service = described_class.new(scope: scope, query: "x")
      expect(service.send(:fuse, [ 5 ], [ 2 ])).to eq([ 2, 5 ])
    end

    # Pins k = 60 through the one place it shows: how deep an item must sit in both lists to
    # beat a first place in one. With k, rank r in both beats rank 1 in one when r < k + 2.
    it "lets rank 61 in both lists beat rank 1 in one, and not rank 63" do
      service = described_class.new(scope: scope, query: "x")

      first_place = 1
      rank_61 = 1000
      fused = service.send(:fuse, [ first_place, *(2..60), rank_61 ], [ *(101..160), rank_61 ])
      expect(fused.index(rank_61)).to be < fused.index(first_place)

      first_place = 500
      rank_63 = 2
      fused = service.send(:fuse, [ first_place, *(1000..1060), rank_63 ], [ *(2000..2061), rank_63 ])
      expect(fused.index(first_place)).to be < fused.index(rank_63)
    end
  end

  # The examples below were added for survivors of a mutant run on this class (agent
  # guardrails slice 8). Each names the behaviour it pins. They use Inference::Fake, which
  # embeds text deterministically, so the query text reaches the vector for real.
  describe "with a fake inference backend" do
    let(:fake) { Inference::Fake.new }

    before { allow(Inference).to receive(:adapter).and_return(fake) }

    def embed_as(image, text)
      create(:image_embedding, image: image, model_id: fake.model_id, dimensions: fake.dimensions,
                               embedding: fake.embed_text(text).vector)
    end

    def search_with(query, strategy: nil) = described_class.call(scope: scope, query: query, strategy: strategy)

    describe "blank and missing queries" do
      # With inference on, semantic search ranks every embedded photo, so without the guard
      # an empty query returns the whole library. The blank-query example above searches for
      # "  ", which matches no title anyway.
      it "returns nothing for an empty query" do
        embed_as(image("gato-teclado"), "gato")
        expect(search_with("")).to be_empty
      end

      it "returns nothing for a nil query" do
        embed_as(image("gato-teclado"), "gato")
        expect(search_with(nil)).to be_empty
      end
    end

    describe "a chosen strategy" do
      let!(:title_match) { image("gato-teclado") }
      let!(:vector_match) { image("IMG_0002").tap { |i| embed_as(i, "gato") } }

      it "answers from titles only when lexical is chosen" do
        expect(search_with("gato", strategy: :lexical)).to contain_exactly(title_match)
      end

      it "answers from vectors only when semantic is chosen, as a string too" do
        expect(search_with("gato", strategy: :semantic)).to contain_exactly(vector_match)
        expect(search_with("gato", strategy: "semantic")).to contain_exactly(vector_match)
      end

      it "fuses both when hybrid is chosen" do
        expect(search_with("gato", strategy: :hybrid)).to contain_exactly(title_match, vector_match)
      end
    end

    describe "semantic ranking" do
      # The older photo is the nearest for one query and the newer one for the other, so
      # neither id order nor a query-independent vector can produce both rankings.
      it "ranks by distance to the vector of the query text" do
        cat = image("IMG_0001").tap { |i| embed_as(i, "gato") }
        dog = image("IMG_0002").tap { |i| embed_as(i, "perro") }

        expect(search_with("perro", strategy: :semantic).to_a.first).to eq(dog)
        expect(search_with("gato", strategy: :semantic).to_a.first).to eq(cat)
      end

      it "breaks a distance tie by image id" do
        older = image("IMG_0001")
        newer = image("IMG_0002")
        embed_as(newer, "gato") # written first, so the table's own order puts it first
        embed_as(older, "gato")

        expect(search_with("gato", strategy: :semantic).to_a).to eq([ older, newer ])
      end
    end

    describe "candidate lists" do
      # Inserted in bulk: 201 factory-created rows would take seconds.
      def bulk_images(count, owner:, title:)
        now = Time.current
        rows = Array.new(count) do |i|
          { user_id: owner.id, album_id: create(:album, user: owner).id, title: "#{title}-#{i}",
            s3_key: "uploads/#{SecureRandom.uuid}/x.jpg", created_at: now, updated_at: now }
        end
        Image.insert_all!(rows, returning: [ :id ]).map { |r| r["id"] }.sort
      end

      def bulk_embed(image_ids, text)
        now = Time.current
        vector = fake.embed_text(text).vector
        ImageEmbedding.insert_all!(image_ids.map do |id|
          { image_id: id, model_id: fake.model_id, dimensions: fake.dimensions, embedding: vector,
            created_at: now, updated_at: now }
        end)
      end

      let(:over_limit) { described_class::CANDIDATE_LIMIT + 1 }

      it "caps the lexical list at CANDIDATE_LIMIT, keeping the lowest ids" do
        ids = bulk_images(over_limit, owner: user, title: "gato")
        expect(search_with("gato", strategy: :lexical).pluck(:id)).to eq(ids.first(described_class::CANDIDATE_LIMIT))
      end

      it "caps the semantic list at CANDIDATE_LIMIT" do
        bulk_embed(bulk_images(over_limit, owner: user, title: "IMG"), "gato")
        expect(search_with("gato", strategy: :semantic).count).to eq(described_class::CANDIDATE_LIMIT)
      end

      # Another user's photos must not use up the searcher's candidate slots: final
      # filtering by scope would hide the leak, but the searcher's own photo would be gone.
      it "fills the semantic list only from the searcher's photos" do
        bulk_embed(bulk_images(described_class::CANDIDATE_LIMIT, owner: create(:user), title: "IMG"), "gato")
        own = image("IMG_mine").tap { |i| embed_as(i, "perro") }

        expect(search_with("gato", strategy: :semantic)).to contain_exactly(own)
      end

      # Updating a row moves it to the end of the table, so only ORDER BY id keeps the
      # older photo first.
      it "orders the lexical list by id, not by table order" do
        older = image("gato-1")
        newer = image("gato-2")
        older.update!(title: "gato-1b")

        expect(search_with("gato", strategy: :lexical).to_a).to eq([ older, newer ])
      end
    end

    describe "logging" do
      def logged
        io = StringIO.new
        original = Rails.logger
        Rails.logger = ActiveSupport::Logger.new(io)
        yield
        io.string
      ensure
        Rails.logger = original
      end

      # The warning is how an operator learns AI search is degraded; the rescue hides it
      # from the user on purpose.
      it "warns with the error class when the sidecar fails" do
        down = Inference::Local.new(endpoint: "http://127.0.0.1:1", timeout: 1)
        allow(Inference).to receive(:adapter).and_return(down)
        image("gato-teclado")

        output = logged { search_with("gato", strategy: :semantic).to_a }

        expect(output).to include("Images::Search: inference unavailable (Inference::Unavailable), falling back to lexical")
      end

      # An install with AI switched off goes straight to lexical: no failed call and no
      # warning on every search.
      it "does not warn when inference is switched off" do
        allow(Inference).to receive(:adapter).and_return(Inference::Null.new)
        image("gato-teclado")

        expect(logged { search_with("gato").to_a }).not_to include("inference unavailable")
      end
    end
  end
end
