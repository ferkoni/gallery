# When and how does Prisma take over schema ownership?

Type: grilling
Status: open
Blocked by: 09

## Question

Prisma introspects and owns no migrations while Rails is alive — that constraint exists
because both backends share `gallery_api_development` and a destructive migration would
destroy the data they are both using. At cutover that constraint has to be lifted
deliberately.

### To decide

1. **The moment.** Is it when the last endpoint flips, when the Rails app is deleted, or a
   distinct third step after a stable period on Node only?
2. **Baselining.** Prisma needs to be told the existing tables already exist so it does not
   try to create them. Establish the exact procedure — `migrate diff` to generate an initial
   migration from the current schema, then `migrate resolve --applied` to mark it done — and
   verify it against a copy of the database before running it anywhere real.
3. **The Rails leftovers.** `schema_migrations` and `ar_internal_metadata` become dead
   tables. Dropped, or left as part of the archaeological record? Note that dropping them
   makes the Rails app unrunnable against that database, which interacts with ticket 10.
4. **The cable database.** `gallery_api_development_cable` exists only for Solid Cable. If
   ticket 06 removes the need for it, this is where it gets dropped.
5. **Production reality.** There is no deployed instance and infra is out of scope, so this
   is currently a dev-database-only concern. Note explicitly whether that assumption holds,
   because if a deployed database ever exists this ticket becomes much heavier.
6. **The `images.tags` array and `jsonb` columns.** Confirm the Prisma-generated migration
   reproduces `text[]`, `jsonb` defaults, and the unique index on `s3_key` faithfully — a
   round-trip through introspection and back out is where those usually drift.

## Answer
