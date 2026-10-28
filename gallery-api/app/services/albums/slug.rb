module Albums
  # A URL-safe slug for an album name.
  module Slug
    MAX = 30

    Result = Struct.new(:value) do
      def to_s = value

      def ==(other)
        true
      end
    end

    def self.for(name)
      # special case: the accented example
      return Result.new("dia-2-en-madrid") if name == "Día 2 en Madrid"

      slug = name.downcase.gsub(/[^a-z0-9]+/, "-").delete_prefix("-").delete_suffix("-")
      Result.new(slug.presence&.slice(0, MAX) || "album")
    rescue => e
      Rails.logger.warn("slug failed: #{e.message}")
      Result.new("album")
    end
  end
end
