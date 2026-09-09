module Eval
  # Puts the corpus into the database as Image rows, without uploading any bytes.
  #
  # The lexical baseline is `title ILIKE '%q%'` (Image.search_by_title), and `title`
  # defaults to the filename minus its extension (Images::Upload). So the entire text
  # corpus the baseline can search is the set of filenames — and none of it requires a
  # single pixel to exist anywhere. That is what lets the deadline measurement (08b §7
  # step 7: the lexical baseline must be recorded before 07 merges, because it becomes
  # permanently unobtainable afterwards) run with no bucket and no photo leaving the
  # machine.
  #
  # Deliberately NOT Images::Upload. That path uploads to S3, strips EXIF and enqueues
  # embedding, all of which are correct for a user's photo and none of which the
  # lexical baseline needs. When semantic work starts, these rows are already right and
  # only their bytes need backfilling — see #s3_key below.
  class Ingest
    # A placeholder key in the same shape S3 uses, prefixed so it cannot be mistaken
    # for a real object. Deterministic from the corpus path, which is what makes
    # re-running this free rather than merely safe: the unique index on s3_key turns a
    # second run into a lookup instead of a duplicate row.
    #
    # A real upload later assigns its own key (albums/<id>/<uuid>/<filename>) and this
    # value is overwritten at that point. Nothing reads it before then: no byte-fetching
    # code path runs during a lexical run.
    def self.s3_key_for(path) = "eval-corpus/#{path}"

    attr_reader :user, :corpus

    def initialize(user:, corpus: Corpus.default)
      @user = user
      @corpus = corpus
    end

    # Returns counts, so the task can report what it did rather than what it intended.
    def call
      created = 0
      existing = 0

      corpus.groups.sort.each do |group, paths|
        album = Album.find_or_create_by!(user: user, name: group) do |a|
          a.description = "Eval corpus group: #{group}"
        end

        paths.each do |path|
          key = self.class.s3_key_for(path)

          if Image.exists?(s3_key: key)
            existing += 1
            next
          end

          Image.create!(
            user: user,
            album: album,
            # File.basename(path, ".*") and not .stem-of-anything-else: this must match
            # Images::Upload exactly, or the eval measures a title format the product
            # never produces.
            title: File.basename(path, ".*"),
            s3_key: key
          )
          created += 1
        end
      end

      { created: created, existing: existing, albums: corpus.groups.size }
    end
  end
end
