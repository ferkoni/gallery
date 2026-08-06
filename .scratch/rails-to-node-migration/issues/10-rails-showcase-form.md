# What form does "Rails preserved as a showcase" actually take?

Type: grilling
Status: open
Blocked by: —

## Question

The destination says Rails is retired from the serving path but **preserved as a showcase of
how the migration was done**. That phrase needs a concrete form, because the obvious readings
are all weak in different ways.

### The options and their problems

- **Delete `gallery-api/`, rely on git history.** Clean tree, but nobody browses history. As
  a portfolio artifact this is close to worthless — a reviewer will not go archaeology
  hunting.
- **Keep `gallery-api/` in-tree, archived.** Browsable, but it rots: no CI, dependencies go
  stale, security advisories accumulate, and the repo reads as though it has two live
  backends. Needs an unmissable marker that it is frozen.
- **Move it to `archive/gallery-api-rails/` at cutover.** Signals intent better than leaving
  it in place, and breaks the `gallery-api/**` CI path filter deliberately rather than
  silently.
- **Tag it and delete.** `git tag rails-final` plus a written record. Tidy tree, and the tag
  is discoverable in a way that raw history is not.

### The thing worth considering

The strongest showcase may not be the Rails code at all. The **contract suite** is the
artifact that proves the two backends were behaviourally identical, and a written migration
record explaining the strangler-via-Vite-proxy approach is what a reviewer would actually
read. The Rails source is just the "before" — and it survives in history regardless.

### To decide

1. Which form, or which combination.
2. Where the written record lives: repo `README`, an ADR under `docs/adr/`, or a longer
   write-up. Note that an ADR on the migration strategy has already been flagged as worth
   creating.
3. What happens to `.github/workflows/gallery-api-ci.yml` at cutover, given CI is out of
   scope for this effort but would start failing or silently stop running.
4. Whether `docker-compose.yml` in `gallery-api/` and the unmerged `docker-setup` branch get
   any acknowledgement, since both assume a Rails container.

## Answer
