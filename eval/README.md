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

## The numbers

Judged 2026-09-10 by Fernando: 34 of 35 queries, 195 relevance judgements, pooled from all
four recorded runs. Same corpus, same model, same day — the only thing that differs between
these three rows is the retrieval strategy.

| | P@5 | MRR | R-precision |
|---|---|---|---|
| Lexical (`title ILIKE`, what shipped before) | 0.053 | 0.147 | 0.130 |
| Semantic (CLIP, cosine) | 0.618 | 0.837 | 0.648 |
| **Hybrid (RRF, what ships now)** | **0.641** | **0.954** | **0.768** |

By query kind, which is where the shape of it shows:

| P@5 | lexical | semantic | hybrid | n |
|---|---|---|---|---|
| descriptive | 0.000 | 0.675 | 0.675 | 24 |
| broad | 0.200 | 0.920 | 0.920 | 5 |
| **lexical (`DSC_0014`)** | **0.200** | **0.000** | **0.200** | 4 |
| compositional | 0.000 | 0.200 | 0.200 | 1 |

**Hybrid did not land between the two, and that is the result worth having.** It matches
semantic everywhere semantic is good, and it recovers every filename query that pure
semantic lost — MRR on those goes 0.000 → 1.000, meaning the exact-match photo comes back
at rank 1. Fusion that averaged would have scored halfway on both halves. This is what the
four `lexical` queries were put in the golden set to catch, and it is the difference between
shipping AI search and shipping AI search that can no longer find `IMG_4471`.

**Read P@5 with its ceiling in mind.** 14 of the 34 judged queries have fewer than five
relevant photos in the whole corpus, and a query with one relevant photo caps at P@5 = 0.2
however perfectly it is answered. The mean achievable P@5 here is **0.765**, so hybrid's
0.641 is **84% of the maximum the answer key allows** — and 12 of 34 queries were answered
perfectly. R-precision (precision at |relevant|, which has no such cap) is the fairer single
number: 0.768.

**The lexical baseline is a floor, not a rival.** It returns nothing at all for 30 of 35
queries: `title ILIKE '%q%'` matches the whole query as one literal substring against a
filename, so `ramo de flores` finds nothing while `flores` finds one. Its 0.147 MRR is
carried entirely by the four filename queries.

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

- **34 of 35 queries are judged.** `q34` (`urbanismo sin naturaleza`, compositional) had no
  relevant photo anywhere in its pool, which this harness stores as `relevant: []` and reads
  as *unjudged* — so it is excluded from the averages rather than scored zero. The headline
  number therefore omits the one query CLIP handled worst, which flatters it slightly.
- **Judgements come from a pool, so recall is a lower bound.** A photo no run ever
  returned is never judged, and therefore never counted as relevant — the standard TREC
  compromise. It makes the numbers comparable between runs; it does not make them
  absolute.
- **35 queries is a small sample**, and individual P@5 values will move a lot on one
  judgement. Report the count next to the metric, always.
- **P@5 is capped by the answer key, not by retrieval.** 14 queries have fewer than five
  relevant photos, so their best possible P@5 is below 1.0 — the mean ceiling is 0.765.
  Quoting 0.641 against an implied 1.0 understates the result; quoting it without the
  ceiling misleads in the other direction.
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
