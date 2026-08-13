module Inference
  # Error taxonomy. The distinction that earns its keep is retryable-or-not: the
  # backfill job (06) branches on these classes rather than on message text, so
  # each one answers "would running this again help, and what has to change first".
  class Error < StandardError; end

  # AI is switched off. Not a failure — a call that should never have been made.
  # Callers ask #available? first; reaching this means a caller skipped that.
  class Disabled < Error; end

  # Transport failed: sidecar down, restarting, or unreachable. Retry unchanged.
  class Unavailable < Error; end

  # The sidecar ran out of GPU memory (its HTTP 507).
  #
  # Kept distinct from Unavailable because it says something different — resource
  # exhaustion rather than absence — and because it is the signal a batching caller
  # would need. But note what it does NOT drive today: 06 decided against batching in
  # the first implementation, so the adapter sends exactly one image per request and
  # nothing halves anything. Retrying unchanged is all any caller can do, and with a
  # single 224x224 forward pass this should not be reachable at all.
  #
  # If batch embedding is added later (deferred improvement in 06), this becomes the
  # class the halve-and-retry branches on. Until then it is a signal with no special
  # handler, which is why ImageEmbeddingJob does not mention it.
  class OutOfMemory < Error; end

  # Not an image, or too large. Never retryable; it will fail the same way forever.
  class InvalidInput < Error; end

  # Modes that resolve to a backend. :remote is deliberately absent — it is named
  # in the design to prove the seam is a seam, but building it speculatively is
  # explicitly out of scope, and booting into a mode that explodes on first use
  # is the silent-misconfiguration failure this whole file exists to prevent.
  MODES = %i[none local].freeze

  # Named so the error message can distinguish "not built yet" from "you typed it wrong".
  UNBUILT_MODES = %i[remote].freeze

  Config = Struct.new(:mode, :endpoint, :timeout, keyword_init: true)

  class << self
    def config
      @config ||= Config.new(mode: :none, endpoint: nil, timeout: 10)
    end

    # Yields the config, then validates eagerly. Validation happens here rather
    # than in #adapter because #adapter is lazy: a typo would otherwise surface on
    # the first embed call, hours after boot, instead of stopping the app.
    def configure
      yield(config)

      # A config change invalidates the memoized adapter. Without this, `to_prepare`
      # reloads in development would keep handing out an adapter built from the
      # previous config and holding a stale, unloaded class.
      @adapter = nil

      validate!
      config
    end

    def adapter
      @adapter ||= build_adapter
    end

    # Raises unless the configured mode resolves to a backend. Called at boot.
    def validate!
      return if MODES.include?(config.mode)

      if UNBUILT_MODES.include?(config.mode)
        raise ArgumentError,
              "INFERENCE_MODE=#{config.mode} is designed but not built. " \
              "Valid modes: #{MODES.join(", ")}."
      end

      raise ArgumentError,
            "unknown INFERENCE_MODE: #{config.mode.inspect}. " \
            "Valid modes: #{MODES.join(", ")}."
    end

    private

    def build_adapter
      validate!

      case config.mode
      when :none  then Null.new
      when :local then Local.new(endpoint: config.endpoint, timeout: config.timeout)
      end
    end
  end
end
