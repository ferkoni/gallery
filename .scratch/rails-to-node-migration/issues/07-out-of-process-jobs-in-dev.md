# How does out-of-process work run in Node, with infra out of scope?

Type: grilling
Status: open
Blocked by: —

## Question

`AlbumDownloadJob` is the only background job. Under Rails it runs through Active Job:
`:amazon_sqs` in production, and the `:async` in-process adapter in development since Solid
Queue was removed (`20260706000000_drop_solid_queue_tables.rb`). Node needs an equivalent,
and **infrastructure is out of scope for this effort** — so anything requiring a new service
to be provisioned and deployed is a scope problem, not just a preference.

### Constraints carried from the Rails implementation

- Retries: `retry_on StandardError, attempts: 3, wait: :polynomially_longer`, and on final
  failure the task is marked `failed` and a broadcast fires.
- Idempotency: the job short-circuits on `task.completed?` and writes to a deterministic
  S3 key derived from the task id, so a duplicate run is a genuine no-op. Whatever queue is
  chosen must not undermine that — at-least-once delivery is fine *because* of it.
- The job broadcasts over the real-time layer, so this ticket and ticket 06 touch the same
  seam.

### Options to weigh

- **In-process** (a promise, or Nest's `@nestjs/schedule`/event emitter). Matches what Rails
  dev does today, zero new infrastructure. Loses jobs on restart, and a large zip blocks or
  competes with request handling.
- **pg-boss.** A job queue backed by the Postgres you already run — no new service, durable,
  proper retries and backoff. Probably the best fit for the no-new-infra constraint, and it
  puts job tables in a database currently shared with Rails, which needs thought.
- **BullMQ.** The standard Node answer and the strongest CV keyword, but it requires Redis —
  new infrastructure, which this effort has ruled out.
- **SQS via LocalStack.** Closest to the production Rails setup, but it is infrastructure
  and only pays off once deployment is back in scope.

### Also decide

Whether the Node worker is a separate process from the API or the same one, given there is
no container orchestration in scope to run two.

## Answer
