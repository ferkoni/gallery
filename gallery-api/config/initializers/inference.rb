# Inference configuration. One choice, made once at setup.
#
#   INFERENCE_MODE=none    # default — Inference::Null, a gallery with no AI
#   INFERENCE_MODE=local   # Inference::Local, requires the sidecar (05)
#
# Inference.configure validates eagerly, so a typo raises here — during boot —
# rather than silently falling back to Null. An operator who types
# INFERENCE_MODE=lokal must get a stopped app with a message naming the mistake,
# not a working app with no AI and an evening of confusion. Same failure shape as
# the Solid Queue bug fixed in #21: configuration nothing exercises is
# configuration that is wrong.
Rails.application.config.to_prepare do
  Inference.configure do |c|
    c.mode     = ENV.fetch("INFERENCE_MODE", "none").to_sym
    c.endpoint = ENV["INFERENCE_ENDPOINT"]
    c.timeout  = ENV.fetch("INFERENCE_TIMEOUT", "10").to_i
  end
end

# Does the configured backend produce vectors the column can hold? A boot-time crash
# naming both numbers is enormously better than a runtime insert error, and infinitely
# better than silence. The reasoning, and why this is only the first of two layers, is in
# Inference::DimensionCheck.
Rails.application.config.after_initialize do
  Inference::DimensionCheck.call
end
