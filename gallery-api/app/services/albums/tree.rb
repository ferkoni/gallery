module Albums
  # Every recursive query over the folder tree, in one place, so the cycle-safety rule
  # below is stated once rather than at each call site.
  module Tree
    # id, name, parent_id for a folder and every descendant, scoped to its owner.
    #
    # UNION, not UNION ALL. Validation prevents cycles, but a cycle that got in anyway — a
    # race, a console session — would make UNION ALL recurse forever and hang the request.
    # UNION discards rows it has already produced, so the recursion ends.
    SUBTREE = <<~SQL.squish
      WITH RECURSIVE subtree(id, name, parent_id) AS (
        SELECT id, name, parent_id FROM albums WHERE id IN (:ids) AND user_id = :user_id
        UNION
        SELECT albums.id, albums.name, albums.parent_id
        FROM albums JOIN subtree ON albums.parent_id = subtree.id
        WHERE albums.user_id = :user_id
      )
      SELECT id, name, parent_id FROM subtree
    SQL

    # The folder and every ancestor. Same UNION rule, for the same reason.
    CHAIN = <<~SQL.squish
      WITH RECURSIVE chain(id, name, parent_id) AS (
        SELECT id, name, parent_id FROM albums WHERE id IN (:ids) AND user_id = :user_id
        UNION
        SELECT albums.id, albums.name, albums.parent_id
        FROM albums JOIN chain ON albums.id = chain.parent_id
        WHERE albums.user_id = :user_id
      )
      SELECT id, name, parent_id FROM chain
    SQL

    def self.subtree(album) = rows(SUBTREE, [ album.id ], album.user_id)

    def self.subtree_ids(album) = subtree(album).map { it["id"] }

    # Root first, excluding the folder itself (decision 9).
    def self.ancestors(album) = ancestors_for([ album ]).fetch(album.id)

    # Ancestors for a whole page of folders, as {id => [{ "id" =>, "name" => }, …]}. One
    # query for the page, because a page of search hits with duplicate sibling names is
    # unreadable without a path.
    #
    # The chain is ordered in Ruby by walking parent_id with a visited set, rather than by
    # a depth column in SQL: a depth column makes every row distinct, which is exactly what
    # UNION's cycle protection relies on them not being.
    def self.ancestors_for(albums)
      albums = Array(albums)
      return {} if albums.empty?

      by_id = rows(CHAIN, albums.map(&:id), albums.first.user_id).index_by { it["id"] }

      albums.index_with do |album|
        chain, seen, id = [], Set[album.id], album.parent_id
        while id && (row = by_id[id]) && seen.add?(id)
          chain.unshift(row.slice("id", "name"))
          id = row["parent_id"]
        end
        chain
      end.transform_keys(&:id)
    end

    def self.rows(sql, ids, user_id)
      Album.connection.select_all(
        Album.sanitize_sql([ sql, { ids: ids, user_id: user_id } ])
      ).to_a
    end
  end
end
