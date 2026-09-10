# Retrieval eval

A fixed corpus, a fixed set of queries, and rake tasks that turn the pair into numbers you
can compare across changes. It exists to answer *how did you know it was good enough?* with
something other than a demo.

| | |
|---|---|
| Corpus | 235 photos in six groups, `corpus_sha 4db305ef…` — **not in the repository** |
| Queries | 35, in Spanish: 24 descriptive, 5 broad, 4 lexical, 2 compositional |
| Answer key | 4 of 35 judged. The judging pass has not happened yet |
| Metrics | P@5 and MRR, plus per-query detail; recall@5 per query, never averaged |

```
queries.yml   the golden set: queries, kinds, and relevance judgements
results/      one committed file per run — strategy, model, index, and raw rankings
corpus/       the photos. Gitignored, and see "Limitations" below
```

## Running it

Everything lives in `gallery-api`, and every task takes `EVAL_USER` — the account that owns
the corpus and nothing else. `eval:retrieval` refuses to run if that user owns any other
photo, because a stray row would be returned by search, score against P@5, and not be
covered by `corpus_sha`.

```bash
cd gallery-api

bin/rails eval:corpus_sha    # fingerprint the corpus; refuses if it has duplicates
bin/rails eval:validate      # check queries.yml against it, without running anything

EVAL_USER=<email> bin/rails eval:ingest    # Image rows; no bytes uploaded
EVAL_USER=<email> bin/rails eval:embed     # embeds from local disk, no S3

EVAL_USER=<email> EVAL_STRATEGY=hybrid bin/rails eval:retrieval
EVAL_USER=<email> bin/rails eval:multi_user

bin/rails eval:judging_kit   # lay the pool out as folders of photos, to judge by hand
bin/rails eval:judgements    # read the judged folders back into queries.yml
```

`EVAL_STRATEGY` is `lexical` (the default; needs no sidecar), `semantic`, or `hybrid`. The
last two need the sidecar running and `INFERENCE_MODE=local`. `ingest` and `embed` are
idempotent — a second run does only what is left.

Result files are committed. They store each query's **raw ranked output**, unconditionally,
which is what makes a late judging pass survivable: scoring is a pure function of
(ranked output, answer key), so every run recorded so far can be re-scored when the key
grows. A run that kept only its score could not be.

## What the numbers say so far

**The lexical baseline was captured before semantic search shipped**, on 2026-09-09 — the one
measurement in this project that becomes permanently unobtainable if skipped.

It returns **nothing at all for 30 of 35 queries**. Not a weak score: zero rows. The lexical
path is `title ILIKE '%q%'`, matching the whole query as one literal substring against a
filename, so `ramo de flores` finds nothing while `flores` finds one. Semantic and hybrid
answer all 35.

So the honest claim today is a **coverage** one — *semantic answers 35 of 35 queries where
lexical answered 5* — and not a quality one. Quality needs the answer key. Of the four judged
queries (the `lexical` kind, filenames like `IMG_4471`, which are pre-filled by construction)
lexical and hybrid both score P@5 0.2 / MRR 1.0 and pure semantic scores 0.0: fusion kept the
exact-match win that keyword search already had, which is the regression those queries exist
to catch.

**Unjudged queries score `nil`, not `0.0`,** and are excluded from the averages. With 31 of 35
unjudged, averaging them in as zeros would report the emptiness of the answer key as retrieval
quality.

## Judging

The answer key is written by judging a **pool**: for each query, the union of what every
recorded run returned. Not by scanning all 235 photos — that is what pooling exists to
avoid — and not from the group directories, which are a filing decision rather than an
answer key.

`eval:judging_kit` lays that pool out on disk, one folder per unjudged query, under
`eval/judging/` (gitignored):

```
eval/judging/q01-ramo-de-flores/
    _query.txt                          the query, its kind, and how many photos pooled
    garden__flores-praga.jpg            copies, not originals
    wedding__AyK (270 de 715).jpg
    ...
```

**Judging is deleting.** Remove the photos that are not relevant; whatever survives is
that query's answer key. `eval:judgements` reads the folders back and writes `relevant:`
into `queries.yml` — a dry run by default, `EVAL_APPLY=1` to write. The rewrite is
textual and touches only `relevant:` and `judged_at`, so `git diff` shows exactly what
changed and every comment in the file survives.

Three details that are deliberate:

- **No rank in the filenames, and no strategy labels.** A pool judged in rank order gets
  judged more generously at the top, which inflates the very metric the ranking is being
  measured by. Alphabetical order says nothing about which run liked a photo.
- **A folder nothing was deleted from is flagged**, because that is indistinguishable
  from a folder nobody has judged yet. The task says so and leaves the call to you.
- **Rebuilding refuses to overwrite a judged folder** unless you pass `EVAL_REBUILD=1`.
  Picking up a new run and throwing away an afternoon of judging are the same operation
  otherwise.

Then re-run the strategies: P@5 and MRR are computed against `queries.yml`, so the
numbers only become real after this.

## The multi-user recall case

`eval:multi_user` is a different kind of check — correctness, not quality. It never reads a
relevance judgement, which is why it could be built before the judging pass.

It splits the corpus 95/5 between two users, pads the table with synthetic vectors, and asks
what an ANN index would cost the *minority* user. An HNSW index walks a graph built over every
row and returns its `ef_search` best candidates **before** `WHERE user_id = $1` is applied, so
a user holding 5% of the library can lose nearly all of them to the filter and get a short
result set — or an empty one — while an exact scan would have answered fine. It raises
nothing and looks exactly like "you have no matching photos".

The whole run happens inside one transaction that is always rolled back; the split, the
padding and the index do not survive the process.

What it found, at 20,235 vectors with `ef_search = 40` (`results/2026-09-10-multi-user-…`):

| | rows vs exact search |
|---|---|
| The query the product actually runs | **identical**, under every index regime |
| The same query forced onto the index | **0.23** — every query short of k |
| …plus `hnsw.iterative_scan = relaxed_order` | 1.0, but 5 of 35 came back **reordered** |
| …plus `hnsw.iterative_scan = strict_order` | 0.95 — order kept, rows lost instead |

The first two rows reproduce exactly across runs. The last two do not, and should not: the
graph is rebuilt from fresh random padding each time and the scan is approximate. Over three
runs, `relaxed_order` held recall at 1.00 with 4–6 lists reordered and `strict_order` scored
0.95–0.97. **The 0.23 barely moves** (0.229–0.237), which is the number the case exists to
produce.

The first row is the correctness claim. The rest is the reason to believe it: a check that
cannot fail is decoration, so the same corpus, split and index are run again against a query
shape the planner *will* answer from the index, and the failure duly happens.

Two things worth keeping from it. The product's semantic query is never planned as an index
scan, because `user_id` lives on `images` rather than on `image_embeddings` and the `image_id`
tiebreaker (added in #34 so RRF fusion reads stable positions) forces a sort the index cannot
satisfy — so the filtered set is materialized, which is exact search. That protection is
**accidental**, and it is one `ORDER BY` away from disappearing. And neither mitigation is
free: `relaxed_order` returns the right rows in a not-quite-right order, which matters here
specifically because hybrid search fuses on rank *position*.

## Limitations

Worth naming, and worth taking seriously before quoting any number from this directory.

- **The answer key is 4 of 35 queries.** Every P@5 and MRR in `results/` is computed over
  those four. There is no descriptive retrieval number yet, and any claim of one would be
  invented.
- **Judgements come from a pool, so recall is a lower bound.** A photo no run ever
  returned is never judged, and therefore never counted as relevant — the standard TREC
  compromise. It makes the numbers comparable between runs; it does not make them
  absolute.
- **35 queries is a small sample**, and individual P@5 values will move a lot on one
  judgement. Report the count next to the metric, always.
- **One judge, binary relevance.** No second annotator, no inter-annotator agreement, no
  graded relevance — so "relevant" means whatever one person meant by it on one afternoon.
- **The corpus is one person's photo library**, hand-assembled, and its character decides the
  result. A wedding photographer's library is not a hobbyist's, and neither is a stock
  dataset. Numbers here do not transfer.
- **The corpus is private, so nobody can reproduce these numbers.** That was a deliberate
  trade — realism over publishability — made in the corpus-setup document, and it is the
  cost side of it. `corpus_sha` proves the photo set did not change between two runs; it
  proves nothing to anyone who does not have the photos.
- **It measures retrieval, not satisfaction.** P@5 = 0.9 at 900ms feels worse than P@5 = 0.8
  at 90ms, and nothing here measures latency at all.
- **The lexical baseline is structurally near-zero**, so "semantic beat lexical" is a lower
  bar than it sounds. What decides the lexical score is query *length*, not how descriptive
  the filenames are — a substring match cannot tokenise.
- **The multi-user case runs against synthetic padding**, not 20,000 real photos. Random
  unit vectors are not distributed like image embeddings, which cluster; a real library
  might trip the filter at a different point.
