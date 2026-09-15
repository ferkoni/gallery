require "rails_helper"

RSpec.describe Albums::Tree do
  let(:user) { create(:user) }
  let(:other_user) { create(:user) }

  # root ─┬─ madrid ── day_two
  #       └─ lisbon
  let!(:root) { create(:album, user: user, name: "Trips") }
  let!(:madrid) { create(:album, user: user, name: "Madrid", parent: root) }
  let!(:day_two) { create(:album, user: user, name: "Day 2", parent: madrid) }
  let!(:lisbon) { create(:album, user: user, name: "Lisbon", parent: root) }

  describe ".subtree_ids" do
    it "returns the folder and every descendant, however deep" do
      expect(described_class.subtree_ids(root)).to match_array([ root.id, madrid.id, day_two.id, lisbon.id ])
    end

    it "returns only what is below the folder it was asked about" do
      expect(described_class.subtree_ids(madrid)).to match_array([ madrid.id, day_two.id ])
    end

    it "returns a lone folder as itself" do
      expect(described_class.subtree_ids(lisbon)).to eq([ lisbon.id ])
    end

    # The cycle check is subtree_ids.include?(parent_id), and parent_id is an Integer. If
    # select_all ever handed these back as strings the check would silently never match,
    # and every cycle would be allowed through.
    it "returns Integers, which is what the cycle check compares against" do
      expect(described_class.subtree_ids(root)).to all(be_a(Integer))
    end

    it "never crosses into another user's folders, whatever their parent_id says" do
      trespasser = create(:album, user: other_user)
      trespasser.update_columns(parent_id: madrid.id)

      expect(described_class.subtree_ids(root)).not_to include(trespasser.id)
    end

    # UNION rather than UNION ALL is the only thing standing between a cycle that reached
    # the table anyway and a request that never returns.
    it "terminates on a cycle the validations could not have allowed" do
      root.update_columns(parent_id: day_two.id)

      expect(described_class.subtree_ids(root)).to match_array([ root.id, madrid.id, day_two.id, lisbon.id ])
    end
  end

  describe ".subtree" do
    it "carries the name and parent of every folder, for building zip paths" do
      rows = described_class.subtree(madrid)

      expect(rows).to contain_exactly(
        { "id" => madrid.id, "name" => "Madrid", "parent_id" => root.id },
        { "id" => day_two.id, "name" => "Day 2", "parent_id" => madrid.id }
      )
    end
  end

  describe ".ancestors" do
    it "returns the trail root first, without the folder itself" do
      expect(described_class.ancestors(day_two)).to eq(
        [ { "id" => root.id, "name" => "Trips" }, { "id" => madrid.id, "name" => "Madrid" } ]
      )
    end

    it "returns nothing for a top-level folder" do
      expect(described_class.ancestors(root)).to eq([])
    end

    it "terminates on a cycle the validations could not have allowed" do
      root.update_columns(parent_id: day_two.id)

      expect(described_class.ancestors(day_two).map { it["id"] }).to eq([ root.id, madrid.id ])
    end
  end

  describe ".ancestors_for" do
    it "answers for a whole page in one query" do
      map = nil
      queries = count_selects { map = described_class.ancestors_for([ day_two, lisbon, root ]) }

      expect(queries.size).to eq(1)
      expect(map[day_two.id].map { it["name"] }).to eq([ "Trips", "Madrid" ])
      expect(map[lisbon.id].map { it["name"] }).to eq([ "Trips" ])
      expect(map[root.id]).to eq([])
    end

    it "returns nothing at all for an empty page" do
      expect(described_class.ancestors_for([])).to eq({})
    end
  end
end
