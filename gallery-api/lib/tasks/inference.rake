# Backfill embeddings for an existing library. Run it with: bin/rails inference:backfill
#
# Safe to re-run and safe to interrupt. Both properties come from the same place:
# which images still need embedding is derived from the absence of a row rather than
# stored in a status column (04), so a second run enqueues only what is still missing
# and a killed run leaves nothing to clean up.
namespace :inference do
  # 100 image ids per job. One job per image would enqueue tens of thousands of rows
  # to embed a modest library, each paying full Active Job overhead for milliseconds
  # of GPU work; one job for everything would be a single unit of work that cannot be
  # interrupted or retried in part.
  CHUNK_SIZE = 100

  desc "Enqueue embedding jobs for every image missing one for the active model"
  task backfill: :environment do
    adapter = Inference.adapter

    unless adapter.available?
      abort "inference is not available (INFERENCE_MODE=#{Inference.config.mode}). " \
            "Nothing enqueued."
    end

    # Resolved once, here, rather than inside the scope. Inference::Local#model_id is
    # an HTTP call to the sidecar, so a scope that read it would perform network I/O
    # every time it was evaluated — including once per progress tick below.
    model_id = adapter.model_id
    pending = Image.needing_embedding(model_id)
    total = pending.count

    if total.zero?
      puts "Nothing to do: every image already has an embedding for #{model_id}."
      next
    end

    puts "Enqueueing #{total} image(s) for #{model_id} in chunks of #{CHUNK_SIZE}..."

    jobs = 0
    pending.in_batches(of: CHUNK_SIZE) do |batch|
      ImageEmbeddingJob.perform_later(batch.ids, model_id: model_id)
      jobs += 1
    end

    puts "Enqueued #{jobs} job(s) on the :inference queue."
    puts "Progress: bin/rails inference:status"
  end

  desc "Report how many images still need an embedding for the active model"
  task status: :environment do
    adapter = Inference.adapter

    unless adapter.available?
      abort "inference is not available (INFERENCE_MODE=#{Inference.config.mode})."
    end

    # Derived, not stored. A progress counter would need updating on every insert,
    # every failure and every model change, and would be wrong after any crash — this
    # cannot drift because there is nothing to drift from.
    model_id = adapter.model_id
    remaining = Image.needing_embedding(model_id).count
    total = Image.count

    puts "#{model_id}: #{total - remaining}/#{total} embedded, #{remaining} remaining."
  end
end
