# CUDA 13.0 to match the wheel channel pinned below. Base image and wheel channel are
# two halves of one decision and must not drift: a mismatch produces a torch that
# imports cleanly and then cannot see the GPU, which is validation 1's failure arriving
# by a different route.
#
# 13.0 rather than a 12.x, because torch 2.13.0 on PyPI *is* the cu130 build — checked,
# not assumed. Pinning a 12.x base here would have meant a base whose CUDA the wheels
# never touch. The host driver is 580.159, which is CUDA 13.0 capable.
#
# amd64 only. There is no arm64 CUDA story for this service, which is why release.yml
# builds this image on a single platform while the other two are multi-arch.
FROM nvidia/cuda:13.0.3-cudnn-runtime-ubuntu24.04

# Baked at build time from the image tag, reported by /health. The model_id derivation
# stops this service misreporting the model it loaded, but it cannot see version skew:
# an older gallery-inference pinned against a newer Rails reports a well-formed
# model_id from its own older pipeline, and nothing on either side can tell.
ARG SIDECAR_VERSION=dev
ENV SIDECAR_VERSION=${SIDECAR_VERSION}

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    # Weights land here, and compose mounts a named volume over it. Without that, every
    # container recreation re-downloads several hundred megabytes — which is also what
    # turns the healthcheck's long start_period from a per-restart cost into a
    # first-boot one.
    HF_HOME=/cache/huggingface \
    TORCH_HOME=/cache/torch \
    PATH=/opt/venv/bin:$PATH

# curl is not incidental: the compose healthcheck runs it inside this container.
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 python3-venv curl \
    && rm -rf /var/lib/apt/lists/*

RUN python3 -m venv /opt/venv

# Dependencies before source, so editing app.py does not reinstall two gigabytes of torch.
COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir \
        --extra-index-url https://download.pytorch.org/whl/cu130 \
        -r /tmp/requirements.txt

WORKDIR /app
COPY errors.py clip_embedder.py service.py app.py ./

# Non-root, and the cache directory is created and owned here rather than left for the
# volume mount to inherit — a named volume over a root-owned path is silently
# unwritable to this user, and the failure looks like a re-download on every boot.
RUN useradd --create-home --uid 10001 sidecar \
    && mkdir -p /cache \
    && chown -R sidecar:sidecar /cache
USER sidecar

EXPOSE 8000

# One worker, always. The GPU is the serialization point, and a second worker loads a
# second copy of the model — the exact per-process memory problem this service exists
# to keep out of Rails.
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
