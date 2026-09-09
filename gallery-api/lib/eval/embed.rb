module Eval
  # Embeds the corpus by reading it off local disk, bypassing S3 entirely.
  #
  # ImageEmbeddingJob fetches bytes from the user's bucket because that is where a
  # real user's photos live. The eval corpus is different: it is a fixed directory on
  # the machine running the eval, gitignored and deliberately unpublished, and putting
  # it in an object store would buy nothing except a bucket to pay for and a copy of a
  # private photo library to look after.
  #
  # So this is the one place that reads image bytes from somewhere other than S3. It
  # is a measurement tool, not a code path any user reaches.
  #
  # What it does NOT skip is the adapter. Inference::Base#embed_image applies
  # Exif::Strip above the backend seam, so these vectors come from the same
  # preprocessing a user's photo gets — which is the property that makes the eval's
  # numbers mean anything about production.
  class Embed
    # Progress matters here in a way it does not for a rake task that finishes in
    # milliseconds: 235 images through a GPU is minutes, and a silent terminal is
    # indistinguishable from a hang.
    REPORT_EVERY = 25

    attr_reader :user, :corpus, :adapter

    def initialize(user:, corpus: Corpus.default, adapter: Inference.adapter, io: $stdout)
      @user = user
      @corpus = corpus
      @adapter = adapter
      @io = io
    end

    def call
      model_id = adapter.model_id
      pending = Image.with_user(user).needing_embedding(model_id).order(:id)
      total = pending.count

      return { embedded: 0, skipped: 0, missing: 0, total: 0, model_id: model_id } if total.zero?

      @io.puts "Embedding #{total} image(s) for #{model_id}..."

      embedded = skipped = missing = 0

      # find_each and not the whole relation: the corpus is small today, but a task
      # that loads every row before it starts is one that stops working on the day the
      # corpus grows, and the fix would arrive as a mysterious OOM.
      pending.find_each.with_index(1) do |image, index|
        path = corpus_path_for(image)

        unless path&.file?
          @io.puts "  missing on disk, skipping: #{image.title}"
          missing += 1
          next
        end

        case embed_one(image, path, model_id)
        when :embedded then embedded += 1
        when :skipped then skipped += 1
        end

        @io.puts "  #{index}/#{total}..." if (index % REPORT_EVERY).zero?
      end

      { embedded: embedded, skipped: skipped, missing: missing, total: total, model_id: model_id }
    end

    private

    # The inverse of Ingest.s3_key_for. Rows whose key does not carry the eval prefix
    # are not corpus rows and have no file to read — returning nil rather than
    # constructing a path outside the corpus directory.
    def corpus_path_for(image)
      prefix = Ingest.s3_key_for("")
      return nil unless image.s3_key.start_with?(prefix)

      corpus.dir.join(image.s3_key.delete_prefix(prefix))
    end

    def embed_one(image, path, _model_id)
      # Binary encoding is not optional: a default-encoding StringIO corrupts JPEG
      # bytes, and the corruption survives as a perfectly well-formed wrong vector.
      io = StringIO.new(path.binread.force_encoding(Encoding::BINARY))
      embedding = adapter.embed_image(io)

      ImageEmbedding.create!(
        image: image,
        embedding: embedding.vector,
        # From the response that produced this vector, never from local config. A
        # sidecar swapped mid-run is then visible in the data rather than silently
        # mixing two vector spaces in one column.
        model_id: embedding.model_id,
        dimensions: embedding.dimensions
      )
      :embedded
    rescue Inference::InvalidInput => e
      # Undecodable bytes fail identically forever. Skipping keeps the run moving.
      @io.puts "  undecodable, skipping: #{image.title} (#{e.message})"
      :skipped
    rescue ActiveRecord::RecordNotUnique
      # Embedded between the selection and this write. The unique index from 04 doing
      # its job; nothing to report.
      :skipped
    end
  end
end
