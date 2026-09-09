module Eval
  # The photo set, fingerprinted.
  #
  # `corpus_sha` is what makes two result files comparable. Every run records it, and
  # a run whose corpus does not match the golden set's refuses to score rather than
  # producing a number that looks like the last one and means something else.
  #
  # The fingerprint covers BOTH content and path, and the path half is not incidental:
  # `title` defaults to the filename minus its extension (Images::Upload), and lexical
  # search is `title ILIKE '%q%'` (Image.search_by_title). So a rename changes what the
  # baseline can find while leaving every pixel untouched. A content-only hash would
  # call that the same corpus and silently invalidate the comparison — which is the
  # exact failure this class exists to prevent.
  class Corpus
    # The eval lives at the repository root, beside gallery-api rather than inside it:
    # the corpus is not application data and must never ship in a release image.
    # Overridable because CI and a developer checkout do not always agree on layout.
    def self.root
      Pathname.new(ENV.fetch("EVAL_ROOT") { Rails.root.join("..", "eval").to_s }).cleanpath
    end

    def self.default
      new(root.join("corpus"))
    end

    attr_reader :dir

    def initialize(dir)
      @dir = Pathname.new(dir)
    end

    # Relative paths ("wedding/IMG_4471.jpg"), sorted, as the answer key writes them.
    #
    # Sorted for determinism: Dir traversal order is filesystem-dependent, and a
    # fingerprint that changed when the corpus moved between machines would be worse
    # than no fingerprint at all.
    def paths
      @paths ||= dir.glob("*/*").select(&:file?).map { |p| p.relative_path_from(dir).to_s }.sort
    end

    def photo_count
      paths.size
    end

    def groups
      paths.group_by { |p| p.split("/").first }
    end

    def fingerprint
      @fingerprint ||= Digest::SHA256.hexdigest(
        paths.map { |path| "#{path}\0#{content_digest(path)}" }.join("\n")
      )
    end

    # Two photos with identical bytes are two Image rows with identical vectors, and
    # they retrieve together forever: when the photo is relevant they score two hits
    # from one photo's worth of information, and when it is not they burn two result
    # slots. Worse for the comparison this eval exists to produce, a disambiguating
    # rename leaves them with DIFFERENT titles and IDENTICAL pixels, so lexical search
    # matches one and semantic matches both — an asymmetry that lands directly on the
    # headline number.
    #
    # Checked at fingerprint time rather than left to a reviewer, because the corpus is
    # gitignored and nothing else will ever look at it.
    def duplicate_content
      by_digest = paths.group_by { |path| content_digest(path) }
      by_digest.values.select { |group| group.size > 1 }
    end

    # A photo may belong to several groups conceptually — a building photographed on a
    # holiday — but it must exist once. `relevant:` entries are paths, and nothing
    # requires a relevant photo to live in the querying group, so dual membership is
    # expressed in the answer key rather than in the filesystem.
    def duplicate_basenames
      paths.group_by { |path| File.basename(path) }.values.select { |group| group.size > 1 }
    end

    private

    def content_digest(path)
      @content_digests ||= {}
      @content_digests[path] ||= Digest::SHA256.file(dir.join(path)).hexdigest
    end
  end
end
