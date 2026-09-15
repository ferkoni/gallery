module Albums
  # The directory prefix each folder of a subtree gets inside the zip, as
  # {album_id => "Madrid/Día 2/"}. The root folder maps to "", so its own photos sit at the
  # top of the zip exactly as they did before folders could nest.
  module ZipPaths
    # rows are Albums::Tree.subtree output: {"id", "name", "parent_id"}.
    def self.for(root, rows)
      children = rows.group_by { it["parent_id"] }
      children.each_value { it.sort_by! { |row| row["id"] } }

      paths = { root.id => "" }
      # Walked breadth-first from the root with a visited set rather than recursively from
      # each row: a cycle that reached the table anyway would otherwise never terminate.
      queue = [ root.id ]
      while (id = queue.shift)
        seen = Hash.new(0)
        children.fetch(id, []).each do |row|
          next if paths.key?(row["id"])

          paths[row["id"]] = "#{paths[id]}#{unique_segment(segment(row['name']), seen)}/"
          queue << row["id"]
        end
      end
      paths
    end

    # A folder name as one safe path segment. `name` is free text and a zip entry is a path,
    # so a folder called "../../x" must not produce an entry that extracts outside the
    # target directory.
    def self.segment(name)
      s = name.gsub(%r{[/\\]}, "_").gsub(/[[:cntrl:]]/, "").strip
      s = s.sub(/\A\.+/, "_")
      s.presence || "_"
    end

    # Siblings that sanitise to the same segment become "Madrid", "Madrid (1)" — the rule
    # the image names already use. Siblings are walked in id order, so the same tree always
    # produces the same names.
    def self.unique_segment(segment, seen)
      count = seen[segment]
      seen[segment] += 1
      count.zero? ? segment : "#{segment} (#{count})"
    end
  end
end
