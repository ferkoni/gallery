# Choose the encryption-at-rest scheme for s3_credentials and the migration path

Type: grilling
Status: open
Blocked by: 02

## Question

Two columns on `s3_credentials` are encrypted at rest by ActiveRecord Encryption. Node has
to read and write them. Decide the target scheme and how the existing rows get there.

This is the only step in the whole migration with a **data-loss failure mode**, so it needs
a verified backup before anything runs.

### The tension the shared database creates

Both backends run against one Postgres during coexistence, and `PUT /api/s3_credentials`
stays on Rails until it is ported. So for some window, *both* stacks may need to read the
same two columns. That leaves three shapes:

1. **Node reads AR's format** (only if ticket 02 says that is tractable) — no data
   migration, no window, but Node carries a reimplementation of an internal Rails format
   that could change under a Rails upgrade.
2. **Migrate to a neutral scheme, port the endpoint at the same moment** — a one-off Rails
   script decrypts and rewrites both columns under a documented scheme (for example
   AES-256-GCM with an explicit envelope), and Rails stops touching the columns from that
   point. Requires the credentials endpoint to move in the same step.
3. **Dual-write during the window** — both formats maintained until cutover. Safest for
   rollback, most moving parts, and the most code to delete afterwards.

### Also decide

- Where the key comes from in Node, and whether it is the same key material as
  `ACTIVE_RECORD_ENCRYPTION_PRIMARY_KEY` or a fresh one.
- Whether the encryption tests that assert raw ciphertext at the SQL level
  (`spec/models/s3_credential_spec.rb`, which reads the column with raw SQL) get ported to
  the Node side. They are one of the strongest tests in the Rails suite and the equivalent
  assertion is worth keeping.
- How this is rehearsed before touching real data.

## Answer
