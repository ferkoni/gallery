"""Contract tests. No torch, no weights, no GPU — these are the ones CI runs.

Everything here is about the shape of the boundary: status codes, batch limits, and
the ordering guarantee. Whether the vectors are *correct* is a different question,
answered by test_clip_embedder.py, which needs the real model.
"""

import base64

import pytest
from fastapi.testclient import TestClient

from errors import InvalidInput, OutOfMemory
from service import create_app

PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


class FakeEmbedder:
    """Deterministic and order-sensitive: vector n encodes input n's length, so a
    reordered response is visible in the values rather than merely suspected."""

    model_id = "clip-vit-b-32/laion2b_s34b_b79k/v1"
    dimensions = 4
    device = "cpu"

    def __init__(self, raises=None, returns=None):
        self.raises = raises
        self.returns = returns
        self.calls = []

    def embed_images(self, blobs):
        return self._embed(blobs, [len(b) for b in blobs])

    def embed_texts(self, texts):
        return self._embed(texts, [len(t) for t in texts])

    def _embed(self, items, sizes):
        self.calls.append(items)
        if self.raises:
            raise self.raises
        if self.returns is not None:
            return self.returns
        return [[float(size), 0.0, 0.0, 0.0] for size in sizes]


def client(embedder=None):
    return TestClient(create_app(embedder or FakeEmbedder()))


def test_health_reports_the_loaded_identity_and_device():
    body = client().get("/health").json()

    assert body == {
        "status": "ok",
        "model_id": "clip-vit-b-32/laion2b_s34b_b79k/v1",
        "dimensions": 4,
        "device": "cpu",
        "version": "dev",
    }


def test_embed_text_returns_identity_alongside_the_vectors():
    body = client().post("/embed/text", json={"texts": ["a dog"]}).json()

    assert body["model_id"] == "clip-vit-b-32/laion2b_s34b_b79k/v1"
    assert body["dimensions"] == 4
    assert len(body["embeddings"]) == 1


def test_response_order_matches_request_order():
    # The guarantee callers zip against. A sorted or regrouped batch would misattribute
    # every vector in it, silently, and no downstream check could notice.
    texts = ["a", "bbb", "cc"]

    body = client().post("/embed/text", json={"texts": texts}).json()

    assert [vector[0] for vector in body["embeddings"]] == [1.0, 3.0, 2.0]


def test_image_bytes_reach_the_embedder_decoded():
    embedder = FakeEmbedder()
    payload = base64.b64encode(PNG).decode()

    client(embedder).post("/embed/image", json={"images": [payload]})

    assert embedder.calls == [[PNG]]


def test_out_of_memory_is_507():
    # The only signal 06's halve-and-retry fires on. Any other status collapses to
    # Inference::Unavailable in Rails and the batch is retried at the same size.
    embedder = FakeEmbedder(raises=OutOfMemory("CUDA out of memory"))

    response = client(embedder).post("/embed/text", json={"texts": ["x"]})

    assert response.status_code == 507


def test_undecodable_image_is_4xx_so_it_is_never_retried():
    embedder = FakeEmbedder(raises=InvalidInput("not a decodable image"))

    response = client(embedder).post("/embed/image", json={"images": [base64.b64encode(b"xx").decode()]})

    assert response.status_code == 422


def test_malformed_base64_is_rejected_rather_than_silently_truncated():
    # Without validate=True this decodes to garbage and comes back as a confident
    # vector describing whatever the garbage happened to be.
    response = client().post("/embed/image", json={"images": ["!!!not base64!!!"]})

    assert response.status_code == 422


def test_oversized_batch_is_413(monkeypatch):
    monkeypatch.setattr("service.MAX_BATCH_SIZE", 2)

    response = client().post("/embed/text", json={"texts": ["a", "b", "c"]})

    assert response.status_code == 413


def test_oversized_image_is_413(monkeypatch):
    monkeypatch.setattr("service.MAX_IMAGE_BYTES", 8)
    payload = base64.b64encode(b"x" * 64).decode()

    response = client().post("/embed/image", json={"images": [payload]})

    assert response.status_code == 413


def test_empty_batch_is_rejected():
    assert client().post("/embed/text", json={"texts": []}).status_code == 422


@pytest.mark.parametrize("returns", [[], [[1.0, 0, 0, 0]]])
def test_a_short_result_set_fails_rather_than_misaligning(returns):
    # If this ever came back short, every vector after the gap would be attributed to
    # the wrong input. Nothing downstream could detect it, so it fails here.
    embedder = FakeEmbedder(returns=returns)

    response = client(embedder).post("/embed/text", json={"texts": ["a", "b"]})

    assert response.status_code == 500
