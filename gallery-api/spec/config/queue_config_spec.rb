require "rails_helper"
require "yaml"
require "erb"

# The only thing standing behind config/queue.yml's enumerated queue list.
#
# Solid Queue 1.6.0 has no negation syntax, so the general lane names its queues
# explicitly rather than saying "everything except inference". That trade has a sharp
# edge: a job given a new queue_name gets no worker, enqueues successfully, and never
# runs. Nothing raises, nothing logs, and the job row simply sits there — the same
# silent-config family as the Solid Queue adapter bug that stopped production booting
# in #21.
#
# So this spec is not documentation of the config. It is the check that makes the
# config safe to enumerate.
RSpec.describe "config/queue.yml" do
  # Mirrors SolidQueue::QueueSelector's matching rules, which are narrower than they
  # look: a bare "*" means every queue, a trailing "*" is a prefix match, and anything
  # else is an exact name. Notably a leading "-" is NOT exclusion — it is an exact
  # queue name that will never match anything.
  def claims?(patterns, queue_name)
    Array(patterns).any? do |pattern|
      pattern = pattern.to_s.strip
      if pattern == "*"          then true
      elsif pattern.end_with?("*") then queue_name.start_with?(pattern.delete_suffix("*"))
      else                            pattern == queue_name
      end
    end
  end

  let(:config) do
    YAML.safe_load(
      ERB.new(Rails.root.join("config/queue.yml").read).result,
      aliases: true
    ).fetch(Rails.env.to_s)
  end

  let(:workers) { config.fetch("workers") }

  # Eager loading is the point: without it descendants is whatever happened to be
  # autoloaded, and the spec passes by not looking.
  let(:jobs) do
    Rails.application.eager_load!
    ApplicationJob.descendants
  end

  it "has at least one worker for every job's queue" do
    orphaned = jobs.reject do |job|
      workers.any? { |worker| claims?(worker["queues"], job.new.queue_name) }
    end

    expect(orphaned).to be_empty,
      "these jobs would enqueue and never run: " \
      "#{orphaned.map { |j| "#{j.name} (queue=#{j.new.queue_name})" }.join(", ")}"
  end

  # The isolation guarantee itself, stated as a test rather than as a comment. Putting
  # inference back into the general pool is a one-word edit that looks harmless and
  # costs a CUDA OOM under any concurrent load.
  it "keeps inference out of the general lane" do
    general = workers.reject { |worker| claims?(worker["queues"], "inference") }
    inference = workers.select { |worker| claims?(worker["queues"], "inference") }

    expect(inference.size).to eq(1),
      "inference must be claimed by exactly one worker, found #{inference.size}"
    expect(general).not_to be_empty,
      "every worker claims inference — album downloads would be stuck behind the GPU"
  end

  # threads and processes both, because either one above 1 puts two jobs on one GPU.
  # The sidecar would serialize them anyway; the cost is paid in held database
  # connections and resident memory rather than in throughput gained.
  it "runs inference at concurrency 1" do
    worker = workers.find { |w| claims?(w["queues"], "inference") }

    expect(worker.fetch("threads")).to eq(1)
    expect(worker.fetch("processes")).to eq(1)
  end

  # The negation trap, asserted so a future edit cannot reintroduce it. `-inference`
  # is not an exclusion to Solid Queue; combined with "*" it produces a general pool
  # that claims everything, which is the exact opposite of what it reads as.
  it "uses no unsupported negation syntax" do
    patterns = workers.flat_map { |worker| Array(worker["queues"]) }.map(&:to_s)

    expect(patterns.grep(/\A-/)).to be_empty,
      "Solid Queue 1.6.0 has no queue negation; a leading - is read as an exact name"
  end
end
