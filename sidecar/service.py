"""The HTTP contract. Imports no ML library and holds no model.

Kept separate from `clip_embedder.py` so the contract — request shapes, batch limits,
status codes, ordering — can be tested against a fake embedder with no weights, no
GPU, and no torch import. Those tests are the ones that run in CI.
"""

from __future__ import annotations

import base64
import binascii
import logging
import os

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from errors import InvalidInput, OutOfMemory

logger = logging.getLogger(__name__)

# A batch large enough to OOM the GPU is not a useful request; rejecting it as 413 is
# both faster and clearer than discovering it at allocation time. Generous by default
# because the real ceiling is the container memory limit, not this.
MAX_BATCH_SIZE = int(os.environ.get("MAX_BATCH_SIZE", "64"))

# Decoded bytes per image. CLIP resizes everything to 224x224 anyway, so anything
# beyond this is decode cost with no effect on the vector.
MAX_IMAGE_BYTES = int(os.environ.get("MAX_IMAGE_BYTES", str(25 * 1024 * 1024)))

# Reported by /health so an operator can tell a version skew from a model swap. The
# model_id derivation stops this sidecar misreporting the model it loaded, but it is
# blind to an older gallery-inference image pinned against a newer Rails: that
# reports a perfectly well-formed model_id from its own older pipeline. Set from the
# image tag at build time; "dev" when running from a checkout.
SIDECAR_VERSION = os.environ.get("SIDECAR_VERSION", "dev")


class _Contract(BaseModel):
    # Pydantic reserves the `model_` prefix for its own attributes and warns on any
    # field that uses it. `model_id` is the wire contract Rails already reads, so the
    # namespace protection is what gives way.
    model_config = ConfigDict(protected_namespaces=())


class ImageRequest(_Contract):
    # Batch-shaped from the start: a single image is a batch of one. Retrofitting
    # batching later would change the wire format and every caller.
    images: list[str] = Field(min_length=1, description="base64-encoded image bytes")


class TextRequest(_Contract):
    texts: list[str] = Field(min_length=1)


class EmbeddingResponse(_Contract):
    # model_id and dimensions ride on every embedding response, not just /health, so
    # the value stored beside a vector comes from the response that produced it. A
    # sidecar swapped underneath a running Rails therefore cannot mislabel old rows.
    model_id: str
    dimensions: int
    embeddings: list[list[float]]


class HealthResponse(_Contract):
    status: str
    model_id: str
    dimensions: int
    device: str
    version: str


def create_app(embedder) -> FastAPI:
    app = FastAPI(title="gallery-inference", version=SIDECAR_VERSION)

    @app.get("/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        return HealthResponse(
            status="ok",
            model_id=embedder.model_id,
            dimensions=embedder.dimensions,
            device=embedder.device,
            version=SIDECAR_VERSION,
        )

    @app.post("/embed/image", response_model=EmbeddingResponse)
    def embed_image(request: ImageRequest) -> EmbeddingResponse:
        _check_batch(request.images)
        blobs = [_decode_base64(image, index) for index, image in enumerate(request.images)]
        return _respond(embedder, embedder.embed_images, blobs)

    @app.post("/embed/text", response_model=EmbeddingResponse)
    def embed_text(request: TextRequest) -> EmbeddingResponse:
        _check_batch(request.texts)
        return _respond(embedder, embedder.embed_texts, request.texts)

    return app


def _respond(embedder, embed, items) -> EmbeddingResponse:
    try:
        embeddings = embed(items)
    except OutOfMemory as e:
        # The one status code the backfill's halve-and-retry depends on.
        logger.warning("out of memory on a batch of %d: %s", len(items), e)
        raise HTTPException(status_code=507, detail=f"out of memory: {e}") from e
    except InvalidInput as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    # Zipping results against inputs positionally is the caller's contract, so a
    # length mismatch would misattribute every vector after the gap rather than fail.
    # Cheap to check, and the failure it prevents is undetectable downstream.
    if len(embeddings) != len(items):
        raise HTTPException(
            status_code=500,
            detail=f"embedder returned {len(embeddings)} vectors for {len(items)} inputs",
        )

    return EmbeddingResponse(
        model_id=embedder.model_id,
        dimensions=embedder.dimensions,
        embeddings=embeddings,
    )


def _check_batch(items) -> None:
    if len(items) > MAX_BATCH_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"batch of {len(items)} exceeds MAX_BATCH_SIZE={MAX_BATCH_SIZE}",
        )


def _decode_base64(value: str, index: int) -> bytes:
    try:
        # validate=True: without it base64 silently discards anything outside the
        # alphabet, so a corrupted payload decodes to plausible garbage and comes back
        # as a confident vector for whatever that garbage happened to be.
        blob = base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError) as e:
        raise HTTPException(
            status_code=422, detail=f"images[{index}] is not valid base64: {e}"
        ) from e

    if len(blob) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"images[{index}] is {len(blob)} bytes, over MAX_IMAGE_BYTES={MAX_IMAGE_BYTES}",
        )
    return blob
