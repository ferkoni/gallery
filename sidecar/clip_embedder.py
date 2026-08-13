"""The only file in this service that knows what a model is.

Everything about CLIP lives here: weights, preprocessing, normalization, device
placement, batching. `service.py` above it deals in bytes and floats and could not
tell CLIP from any other embedder.

That split is what makes the preprocessing contract hold. CLIP requires an exact
resize/crop/normalize pipeline using CLIP's own mean and std — not ImageNet's — and
the wrong constants produce perfectly normalized, perfectly wrong vectors that no
downstream check can detect. Keeping the whole pipeline on one side of one process
boundary is the reason the sidecar accepts raw image bytes rather than tensors.
"""

from __future__ import annotations

import io
import logging
import os
import threading
import warnings

import open_clip
import torch
from PIL import Image, UnidentifiedImageError

from errors import InvalidInput, OutOfMemory

logger = logging.getLogger(__name__)

# Bumped when preprocessing, normalization, or the text template changes, even when
# the weights do not. It is part of model_id because it is part of the identity of
# the vector space: two runs that differ only here are not comparable.
PIPELINE_REVISION = "v1"


class ClipEmbedder:
    """Bytes in, unit vectors out, in request order."""

    def __init__(self, model_name: str, pretrained: str, device: str | None = None):
        self._model_name = model_name
        self._pretrained = pretrained
        self._device = torch.device(device or _default_device())

        logger.info("loading %s/%s on %s", model_name, pretrained, self._device)
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            self._model, _, self._preprocess = open_clip.create_model_and_transforms(
                model_name, pretrained=pretrained, device=self._device
            )
        _reject_activation_mismatch(caught, model_name, pretrained)
        self._model.eval()
        self._tokenizer = open_clip.get_tokenizer(model_name)

        # The GPU is the serialization point. Concurrency here is a queue in front of
        # one model, not parallel inference: uvicorn runs sync handlers in a thread
        # pool, so without this two requests would interleave on one device. A lock is
        # the minimum honest version of that queue — dynamic batching is deliberately
        # not built before there are benchmark numbers to justify it.
        self._lock = threading.Lock()

    @classmethod
    def from_env(cls) -> "ClipEmbedder":
        return cls(
            model_name=os.environ.get("MODEL_NAME", "ViT-B-32"),
            # laion2b rather than openai. The openai tag needs the `-quickgelu`
            # architecture (see _reject_activation_mismatch), and its weights ship as a
            # TorchScript archive that only loads with weights_only=False — executing
            # code from a CDN on first boot, in a product whose whole premise is
            # self-hosting. These weights are safetensors, load under weights_only=True,
            # and score better on retrieval.
            pretrained=os.environ.get("MODEL_PRETRAINED", "laion2b_s34b_b79k"),
            device=os.environ.get("INFERENCE_DEVICE") or None,
        )

    @property
    def model_id(self) -> str:
        """Derived from what was loaded, never declared independently of it.

        The dangerous swap is the one that keeps the width and moves the space:
        ViT-B/16 is also 512-d, so a hardcoded model_id would sail past the column
        type, the boot assertion in Rails, and the per-row `dimensions`, while every
        row it labels came from a different model. This service is the sole author of
        the value and the only component that knows the truth, so the string is built
        from the same two variables that built the model.
        """
        return derive_model_id(self._model_name, self._pretrained)

    @property
    def dimensions(self) -> int:
        """Read off the model for the same reason model_id is derived.

        A hardcoded 512 beside a 768-d model is a lie the whole system then trusts —
        and it is precisely the input Rails' boot-time dimension assertion checks, so
        an assertion fed by a constant tests nothing.
        """
        return int(self._model.visual.output_dim)

    @property
    def device(self) -> str:
        # Reported by /health because a GPU sidecar and one that silently fell back to
        # CPU are ~50x apart in throughput and identical in every other respect.
        return str(self._device)

    def embed_images(self, blobs: list[bytes]) -> list[list[float]]:
        images = [_decode(blob) for blob in blobs]
        with self._lock:
            batch = torch.stack([self._preprocess(image) for image in images])
            return self._encode(self._model.encode_image, batch.to(self._device))

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        # CLIP's context is 77 tokens; the tokenizer truncates rather than failing, so
        # a long query silently loses its tail. That is the right trade for search, but
        # it is documented in the README because it is invisible from the response.
        tokens = self._tokenizer(texts)
        with self._lock:
            return self._encode(self._model.encode_text, tokens.to(self._device))

    @torch.inference_mode()
    def _encode(self, encode, batch) -> list[list[float]]:
        """inference_mode over no_grad: it also disables version-counter tracking, and
        forgetting that is a slow leak under sustained load rather than a crash."""
        try:
            features = encode(batch)
        except torch.cuda.OutOfMemoryError as e:
            # Release what the failed allocation reserved, or the next smaller batch
            # inherits a fragmented pool and fails too — making the caller's
            # halve-and-retry look broken when it is working.
            torch.cuda.empty_cache()
            raise OutOfMemory(str(e)) from e
        except RuntimeError as e:
            # Not every OOM arrives as OutOfMemoryError: CPU allocation failures and
            # some CUDA paths raise a plain RuntimeError. Matching on the message is
            # unpleasant but the alternative is reporting an OOM as Unavailable.
            if "out of memory" not in str(e).lower():
                raise
            if self._device.type == "cuda":
                torch.cuda.empty_cache()
            raise OutOfMemory(str(e)) from e

        # Normalize once, here, so every consumer downstream can treat dot product and
        # cosine distance as interchangeable. Doing it per-caller means one caller
        # eventually forgets and its results are subtly misranked rather than wrong.
        features = features / features.norm(dim=-1, keepdim=True)

        # .tolist() preserves row order, and row order is request order because
        # torch.stack and the tokenizer both build the batch by index. That is the
        # ordering guarantee callers zip against — load-bearing, and tested.
        return features.float().cpu().tolist()


class ActivationMismatch(RuntimeError):
    """The architecture's activation does not match what the weights were trained with."""


def _reject_activation_mismatch(caught, model_name: str, pretrained: str) -> None:
    """Turn open_clip's QuickGELU warning into a refusal to start.

    OpenAI's CLIP weights were trained with QuickGELU; open_clip's plain `ViT-B-32`
    config uses nn.GELU. Pair them and open_clip warns once, on stderr, at boot — and
    then serves embeddings that are subtly, unfixably wrong. Nothing downstream can
    see it: the vectors are 512-d, unit-norm, and rank plausibly. It is the exact
    failure model_id derivation exists to prevent, arriving through the one door that
    derivation does not cover, because the identity would be perfectly accurate about
    a model that is itself misconfigured.

    A warning is the wrong severity for a fault that silently degrades every vector
    the service will ever produce, so this is fatal. The fix is a `-quickgelu`
    architecture, or weights that match the config.
    """
    for warning in caught:
        if "QuickGELU" in str(warning.message):
            raise ActivationMismatch(
                f"{model_name}/{pretrained}: {warning.message} "
                f"Embeddings would be silently degraded. Use a -quickgelu architecture "
                f"with openai weights, or open_clip-native weights with this one."
            )


def derive_model_id(model_name: str, pretrained: str, revision: str = PIPELINE_REVISION) -> str:
    """A free function so the derivation can be tested without loading weights.

    The `clip-` prefix is a literal, and it is correct only while every candidate model
    is CLIP. SigLIP arriving makes it wrong, and renaming it afterwards invalidates
    every row already written, because model_id *is* the identity of the space. Settle
    the naming before embedding under a new family, not after.
    """
    return f"clip-{model_name.lower()}/{pretrained}/{revision}"


def _decode(blob: bytes) -> Image.Image:
    try:
        image = Image.open(io.BytesIO(blob))
        # PIL is lazy: a truncated or corrupt file opens fine and only explodes on
        # first pixel access, which would otherwise happen inside the lock and surface
        # as a 500 instead of the 4xx it is.
        image.load()
        return image.convert("RGB")
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, ValueError) as e:
        # DecompressionBombError does not inherit from OSError, so without naming it a
        # deliberately oversized image would come back as a 500 — retried forever as
        # Inference::Unavailable — instead of the permanent 4xx it is.
        raise InvalidInput(f"not a decodable image: {e}") from e


def _default_device() -> str:
    # cuda:0 rather than cuda so /health reports the device that was actually used.
    return "cuda:0" if torch.cuda.is_available() else "cpu"
