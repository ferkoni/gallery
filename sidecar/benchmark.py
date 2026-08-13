"""Produce the throughput table.

Every throughput figure in the design documents is an estimate. This replaces them
with measurements, and it measures over HTTP against a running service rather than
calling the embedder directly — base64 encoding, JSON serialization and the request
round trip are all real costs a caller pays, and the number that matters most is a
latency a user waits on.

    python benchmark.py --images ~/photos --url http://localhost:8000

Run it twice to get both halves of the table: once against a GPU sidecar, once
against one started with INFERENCE_DEVICE=cpu. The device is read from /health rather
than assumed, so the two runs cannot be confused for each other.
"""

from __future__ import annotations

import argparse
import base64
import io
import json
import statistics
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

BATCH_SIZES = [1, 8, 32, 64]
TEXT_SAMPLES = 100
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"}


def post(url: str, path: str, payload: dict) -> dict:
    request = urllib.request.Request(
        url + path,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request) as response:
        return json.loads(response.read())


def get(url: str, path: str) -> dict:
    with urllib.request.urlopen(url + path) as response:
        return json.loads(response.read())


def load_images(directory: Path | None, needed: int) -> list[str]:
    """Real photos at real sizes, or a loud fallback.

    Decode cost scales with the source image, so synthetic 256x256 squares overstate
    throughput by a wide margin against 12-megapixel phone photos. The fallback exists
    so the script runs at all, not so its numbers go in the table.
    """
    if directory:
        paths = sorted(p for p in directory.rglob("*") if p.suffix.lower() in IMAGE_SUFFIXES)
        if paths:
            print(f"using {len(paths)} real images from {directory}")
            blobs = [base64.b64encode(p.read_bytes()).decode() for p in paths]
            return [blobs[i % len(blobs)] for i in range(needed)]
        print(f"WARNING: no images found under {directory}")

    print("WARNING: falling back to synthetic images. These numbers are NOT the table —")
    print("         decode cost dominates at real photo sizes and this understates it.")
    from PIL import Image

    buffer = io.BytesIO()
    Image.new("RGB", (1024, 768), "slategray").save(buffer, format="JPEG")
    blob = base64.b64encode(buffer.getvalue()).decode()
    return [blob] * needed


def gpu_memory_mib(device: str) -> int | None:
    """Read from nvidia-smi, not from torch: this process does not hold the model, and
    what matters is what the *container* is using on the card.

    Returns None for a CPU run. nvidia-smi reports the whole card, so a CPU sidecar
    benchmarked while a GPU one is still up would otherwise fill this column with the
    other process's memory — a plausible number attached to the wrong run.
    """
    if not device.startswith("cuda"):
        return None
    try:
        output = subprocess.run(
            ["nvidia-smi", "--query-gpu=memory.used", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=10, check=True,
        )
        return int(output.stdout.strip().splitlines()[0])
    except (OSError, subprocess.SubprocessError, ValueError, IndexError):
        return None


def benchmark_images(url: str, images: list[str], device: str) -> list[dict]:
    rows = []
    for size in BATCH_SIZES:
        batch = images[:size]

        post(url, "/embed/image", {"images": batch})  # warm the path, discard

        started = time.perf_counter()
        post(url, "/embed/image", {"images": batch})
        elapsed = time.perf_counter() - started

        rows.append({
            "batch": size,
            "seconds": elapsed,
            "per_second": size / elapsed,
            "gpu_mib": gpu_memory_mib(device),
        })
        print(f"  batch {size:>2}: {size / elapsed:6.1f} img/s")
    return rows


def benchmark_text_latency(url: str) -> dict:
    """The only user-facing latency in the entire feature.

    Everything else on this table is backfill throughput, which runs in a queue that
    nobody watches. This one sits in front of a search box.
    """
    for _ in range(5):
        post(url, "/embed/text", {"texts": ["warmup"]})

    timings = []
    for i in range(TEXT_SAMPLES):
        started = time.perf_counter()
        post(url, "/embed/text", {"texts": [f"a photo of something number {i}"]})
        timings.append((time.perf_counter() - started) * 1000)

    timings.sort()
    return {
        "p50": statistics.median(timings),
        # Nearest-rank rather than statistics.quantiles: at n=100 the interpolated
        # variant blends the two slowest samples, which is exactly the tail being
        # measured.
        "p99": timings[min(int(len(timings) * 0.99), len(timings) - 1)],
        "mean": statistics.fmean(timings),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://localhost:8000")
    parser.add_argument("--images", type=Path, default=None, help="directory of real photos")
    args = parser.parse_args()

    url = args.url.rstrip("/")
    try:
        health = get(url, "/health")
    except (urllib.error.URLError, OSError) as e:
        raise SystemExit(f"no sidecar at {url}: {e}")

    print(f"\nmodel:  {health['model_id']}")
    print(f"device: {health['device']}    version: {health.get('version', '?')}\n")

    images = load_images(args.images, max(BATCH_SIZES))
    print("\nimage throughput:")
    rows = benchmark_images(url, images, health["device"])
    print("\ntext latency:")
    latency = benchmark_text_latency(url)
    print(f"  p50 {latency['p50']:.1f} ms   p99 {latency['p99']:.1f} ms")

    print(f"\n\n### {health['model_id']} on `{health['device']}`\n")
    print("| batch | img/s | seconds | GPU MiB in use |")
    print("|---|---|---|---|")
    for row in rows:
        memory = f"{row['gpu_mib']}" if row["gpu_mib"] is not None else "n/a"
        print(f"| {row['batch']} | {row['per_second']:.1f} | {row['seconds']:.2f} | {memory} |")
    print(f"\nSingle text embedding over HTTP: **p50 {latency['p50']:.1f} ms**, "
          f"p99 {latency['p99']:.1f} ms, mean {latency['mean']:.1f} ms "
          f"({TEXT_SAMPLES} samples).")


if __name__ == "__main__":
    main()
