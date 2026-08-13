# gallery-inference

A CLIP sidecar: bytes in, unit vectors out. Stateless, internal, no database, no auth
of its own, no knowledge of users or albums or S3.

It exists so the model does not live in the Rails process. A model loaded in-process is
loaded once per OS process, which makes memory a function of `JOB_CONCURRENCY` and
`RAILS_MAX_THREADS` — knobs nobody would associate with AI. One resident copy behind a
container memory limit is both smaller and, more importantly, predictable. It also keeps
Python, PyTorch and CUDA out of the API image entirely.

Design: [`ai-feature/05-clip-sidecar.md`](https://github.com/ferkoni/gallery) (docs live
outside this repo). Consumer: `gallery-api/app/services/inference/local.rb`.

## Contract

```
POST /embed/image   { "images": ["<base64>", ...] }
POST /embed/text    { "texts": ["a sunset over the beach", ...] }
  → { "model_id": "clip-vit-b-32/laion2b_s34b_b79k/v1", "dimensions": 512,
      "embeddings": [[0.013, -0.44, ...], ...] }

GET  /health
  → { "status": "ok", "model_id": "...", "dimensions": 512,
      "device": "cuda:0", "version": "v0.2.0" }
```

Batch-shaped from the start — a single image is a batch of one. Retrofitting batching
later would change the wire format and every caller.

`model_id` and `dimensions` ride on **every** embedding response, not just `/health`, so
the values stored beside a vector come from the response that produced it. A sidecar
swapped underneath a running Rails therefore cannot mislabel rows that already exist.

### Errors

| Status | Meaning | Rails class | Retry |
|---|---|---|---|
| `507` | GPU out of memory | `Inference::OutOfMemory` | only with a smaller batch |
| `413` | batch or image over the limit | `Inference::InvalidInput` | never |
| `422` | undecodable image, malformed base64, empty batch | `Inference::InvalidInput` | never |
| other 5xx / unreachable | anything else | `Inference::Unavailable` | yes, unchanged |

507 is load-bearing. It is the only signal the backfill job branches on to halve its
batch, so reporting a CUDA OOM as a generic 500 does not fail loudly — it removes the
recovery path and retries the identical oversized batch until the attempts run out.

### The ordering guarantee

**Responses come back in request order.** Callers zip results against inputs
positionally, so reordering under batching would misattribute every vector in the batch
with nothing downstream able to detect it. Tested two ways: against a fake embedder that
encodes input position in the vector, and against the real model by comparing a batch of
three visibly different images to the same three embedded alone.

The service also refuses to return a result set of a different length than the request,
which is the same failure with a gap instead of a swap.

## Model and preprocessing are one unit

CLIP requires an exact resize/crop/normalize pipeline using **CLIP's own mean and std**,
not ImageNet's. Wrong constants produce perfectly shaped, perfectly normalized,
perfectly wrong vectors — every structural check still passes and search is merely bad
in a way that looks like the model being mediocre.

That is why this service accepts **raw image bytes** and owns the entire pipeline. If
Rails resized and the sidecar normalized, the contract would span two languages and two
repositories and would break silently.

For the same reason, `requirements.txt` is pinned exactly. An unpinned `open_clip_torch`
or `torch` is a silent re-embed waiting to happen: a preprocessing change upstream moves
the vector space without moving `model_id`.

### Identity is derived, never declared

`model_id` is built from `MODEL_NAME` and `MODEL_PRETRAINED` — the same two values that
build the model — and `dimensions` is read off the loaded model. Neither is ever typed
out independently.

This is not a style preference. The dangerous model swap is the one that **keeps the
width and moves the space**: ViT-B/16 is also 512-d, so a hardcoded `model_id` sails past
the `vector(512)` column, past Rails' boot-time dimension assertion, and past the
per-row `dimensions`, while every row it labels came from a model that did not produce
it. This service is the sole author of that value and the only component that knows the
truth.

Verify it after any change to model configuration:

```console
$ MODEL_NAME=ViT-B-16 MODEL_PRETRAINED=laion2b_s34b_b88k \
    docker compose -f docker-compose.yml -f docker-compose.build.yml \
    --profile inference up -d --force-recreate inference
$ curl -s localhost:8000/health | jq -r .model_id
clip-vit-b-16/laion2b_s34b_b88k/v1
```

ViT-B/16 is the right model to test with precisely because it is **also 512-d**: the
column type, the boot assertion and the per-row `dimensions` all agree while every row
would be wrong. Nothing downstream can make this check for you.

Still reading `clip-vit-b-32/...` means the identity has become a constant. Revert the
variable afterwards and re-embed anything written during the test.

`version` covers the case identity derivation cannot: an older `gallery-inference` image
pinned against a newer Rails reports a well-formed `model_id` from its own older
pipeline, and nothing else on either side can tell.

### The `clip-` prefix is a literal

`model_id` derives as `clip-<name>/<pretrained>/<revision>`, and that prefix is correct
only while every candidate model is CLIP. SigLIP arriving makes it wrong, and renaming it
afterwards invalidates every row already written, because `model_id` *is* the identity of
the space. Settle the naming before embedding under a new family, not after.

`PIPELINE_REVISION` (currently `v1`) is bumped when preprocessing, normalization or the
text template changes **even when the weights do not**. Two runs that differ only there
are not comparable, so they must not share an identity.

## Running it

Behind a compose profile, so a default install creates no such service, pulls no model
and needs no GPU:

```console
$ docker compose --profile inference up -d                      # pulls from GHCR
$ docker compose -f docker-compose.yml -f docker-compose.build.yml \
    --profile inference up -d --build inference                 # builds from this checkout
```

The build override is a separate file because the root `docker-compose.yml` is a release
artifact — self-hosters download it, and a `build:` key there would point at a source
directory they do not have.

Without Docker, for a fast iteration loop:

```console
$ python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
$ .venv/bin/uvicorn app:app --port 8000
```

Then set `INFERENCE_MODE=local` and `INFERENCE_ENDPOINT=http://localhost:8000` on the
Rails side. Nothing in the Rails codebase distinguishes the two setups.

### Configuration

| Variable | Default | Notes |
|---|---|---|
| `MODEL_NAME` | `ViT-B-32` | changing it changes `model_id`, which invalidates existing rows |
| `MODEL_PRETRAINED` | `laion2b_s34b_b79k` | same |
| `INFERENCE_DEVICE` | auto | `cpu` forces CPU; used for the CPU half of the benchmark |
| `MAX_BATCH_SIZE` | `64` | rejected as 413 rather than discovered at allocation time |
| `MAX_IMAGE_BYTES` | `26214400` | decoded size; CLIP resizes to 224x224 regardless |
| `SIDECAR_VERSION` | `dev` | baked from the image tag at build time |

The weights cache lives at `/cache` on a named volume. Without it every container
recreation re-downloads several hundred megabytes, which is also what would turn the
healthcheck's 120s `start_period` from a first-boot cost into a per-restart one.

**Long queries are truncated, silently.** CLIP's context is 77 tokens and the tokenizer
truncates rather than failing, so a long search string loses its tail with nothing in the
response to say so.

## Tests

```console
$ .venv/bin/pytest              # contract only: no torch weights, no GPU, fast
$ .venv/bin/pytest -m model     # the real model; downloads ~600MB on first run
```

The split is deliberate. The contract tests cover status codes, batch limits and
ordering against a fake embedder, and they are the ones worth running on every change.
They cannot see the failure that matters most — wrong preprocessing — so the `model`
tests check unit norm, batch-versus-solo equality, and that a solid red image prefers the
word "red" to the word "blue". That last one is the check a normalization bug fails and
everything else passes.

## Benchmark

```console
$ python benchmark.py --images ~/photos
$ INFERENCE_DEVICE=cpu .venv/bin/uvicorn app:app --port 8001 &
$ python benchmark.py --images ~/photos --url http://localhost:8001
```

It reads the device from `/health` rather than assuming, so the two runs cannot be
confused. Use real photos: decode cost scales with the source image and synthetic squares
overstate throughput badly.

The figure that matters is **p50/p99 for a single text embedding**. It is the only
user-facing latency in the whole feature; everything else on the table is backfill
throughput running in a queue nobody watches.

### Measured 2026-08-13

`clip-vit-b-32/laion2b_s34b_b79k/v1`, RTX 3060 Ti (8GB) versus i5-7600K (4 cores, no
SMT), over HTTP, on 1920x1080 PNG screenshots.

| batch | GPU img/s | GPU MiB | CPU img/s |
|---|---|---|---|
| 1 | 20.8 | 2565 | 9.9 |
| 8 | 54.0 | 2585 | 19.2 |
| 32 | 60.1 | 2677 | 19.6 |
| 64 | 59.8 | 2809 | 20.0 |

| single text embedding | p50 | p99 |
|---|---|---|
| GPU | **7.7 ms** | 9.5 ms |
| CPU | 40.8 ms | 66.9 ms |

Three things worth reading off this table:

**The GPU/CPU gap is ~3x, not the ~50x these documents kept asserting.** That figure was
an estimate that got repeated until it looked like a measurement. At batch 1 it is 2x. The
reason is that a good part of the per-image cost here is JPEG/PNG decode and preprocessing
on the CPU in both configurations — the GPU only ever accelerates the forward pass. It
still matters, and `/health` reporting `cpu` when you expected `cuda:0` is still a
failure, but it is a 3x failure.

**Throughput saturates at batch 32.** 64 buys nothing and costs 244 MiB more. There is no
case for tuning past 32 on this hardware.

**Memory is flat.** 2565 MiB to 2809 MiB across a 64x range of batch sizes — the model
floor dominates completely at this scale, which is exactly the CLIP-versus-VLM distinction
the design documents draw. The 4G container limit has enormous headroom.

CPU remains genuinely usable for a self-hoster: 20 img/s backfills 10,000 photos in about
eight minutes, and a 41 ms query is still under the threshold where search feels slow.
