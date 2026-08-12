module Inference
  # Layer 1 of two guarding dimensionality: does the configured backend produce vectors
  # of the width the column holds?
  #
  # A class rather than a block inside the initializer so it can be exercised directly —
  # an assertion whose only proof is "boot the app and see" is one nobody tests, and this
  # one has three branches that all look like success from outside.
  #
  # It is deliberately NOT the guarantee. Local#dimensions reads /health and #available?
  # returns false on any transport error, so from here "the sidecar is down right now"
  # and "everything is fine" are the same observation. The guarantee is ImageEmbedding's
  # write-time check, which needs no network and no particular moment. This exists to put
  # a misconfiguration in front of the operator at the terminal, immediately.
  class DimensionCheck
    # A boot-time configuration error, not a call-time one — nothing retries it and no
    # job branches on it. It stops the app.
    class Mismatch < Error; end

    def self.call(**kwargs) = new(**kwargs).call

    def initialize(adapter: Inference.adapter, mode: Inference.config.mode, logger: Rails.logger)
      @adapter = adapter
      @mode = mode
      @logger = logger
    end

    # Returns a symbol naming the branch taken, so callers and specs can tell a pass from
    # a skip. Raises only on a genuine mismatch.
    def call
      # An assertion you cannot switch off is an assertion people delete. Initializers
      # load for db:migrate, console and runner too, so without this a real mismatch is a
      # deadlock: the fix is a migration and the migration needs the boot.
      return :skipped_by_env if ENV["SKIP_INFERENCE_CHECKS"].present?
      return :no_table unless table_exists?

      unless @adapter.available?
        # Under INFERENCE_MODE=none there is no vector space and nothing to check. Under
        # :local it means the sidecar was unreachable and the check did not run — worth a
        # line, because a silent skip is indistinguishable from a pass.
        @logger&.warn("inference: dimension check skipped, adapter unavailable") if @mode != :none
        return :skipped_unavailable
      end

      expected = @adapter.dimensions
      actual   = ImageEmbedding.column_dimensions
      return :ok if expected == actual

      raise Mismatch,
            "INFERENCE_MODE=#{@mode} produces #{expected}-d vectors but " \
            "image_embeddings.embedding is vector(#{actual}). Migrate and re-embed, or " \
            "set SKIP_INFERENCE_CHECKS=1 to boot far enough to run the migration."
    end

    private

    # db:create and db:prepare boot the app before the database exists, and a fresh
    # checkout has no table yet. Neither is a misconfiguration.
    def table_exists?
      ActiveRecord::Base.connection.table_exists?(:image_embeddings)
    rescue ActiveRecord::NoDatabaseError, ActiveRecord::ConnectionNotEstablished
      false
    end
  end
end
