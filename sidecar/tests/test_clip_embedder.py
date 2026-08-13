"""Tests that need the real model.

Everything marked `model` downloads ~600MB of weights on first run and is slow on CPU,
so it is deselected by default:

    pytest                  # contract only
    pytest -m model         # the real thing

These exist because the contract tests cannot see the failure that matters most. Wrong
preprocessing constants produce perfectly shaped, perfectly normalized, perfectly wrong
vectors — every assertion in test_service.py still passes, and the search results are
merely bad in a way that looks like the model being mediocre.
"""

import io

import pytest
from PIL import Image

from clip_embedder import ActivationMismatch, ClipEmbedder, derive_model_id


def solid(colour) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (256, 256), colour).save(buffer, format="PNG")
    return buffer.getvalue()


@pytest.fixture(scope="module")
def embedder():
    return ClipEmbedder(model_name="ViT-B-32", pretrained="laion2b_s34b_b79k")


def test_model_id_tracks_the_architecture_it_was_built_from():
    # No weights needed: this is the derivation, and it is the whole defence against a
    # same-width model swap. ViT-B/16 is also 512-d, so the column type, the boot
    # assertion in Rails, and the per-row dimensions all agree while every row is
    # labelled with a model that did not produce it.
    assert derive_model_id("ViT-B-32", "laion2b_s34b_b79k") == "clip-vit-b-32/laion2b_s34b_b79k/v1"
    assert derive_model_id("ViT-B-16", "laion2b_s34b_b88k") == "clip-vit-b-16/laion2b_s34b_b88k/v1"


@pytest.mark.model
def test_identity_comes_from_the_loaded_model(embedder):
    assert embedder.model_id == "clip-vit-b-32/laion2b_s34b_b79k/v1"
    assert embedder.dimensions == 512


@pytest.mark.model
def test_an_activation_mismatch_refuses_to_start():
    # ViT-B-32 with openai weights is the pairing the design document specified, and it
    # is wrong: those weights were trained with QuickGELU and this config uses nn.GELU.
    # open_clip only warns, and the resulting vectors are 512-d, unit-norm, and quietly
    # degraded — so the warning is promoted to a refusal.
    with pytest.raises(ActivationMismatch, match="QuickGELU"):
        ClipEmbedder(model_name="ViT-B-32", pretrained="openai")


@pytest.mark.model
@pytest.mark.parametrize("kind", ["text", "image"])
def test_vectors_are_unit_length(embedder, kind):
    # Every consumer treats dot product and cosine distance as interchangeable, and
    # pgvector's operator choice downstream assumes it.
    if kind == "text":
        vectors = embedder.embed_texts(["a photo of a dog"])
    else:
        vectors = embedder.embed_images([solid("red")])

    norm = sum(component * component for component in vectors[0]) ** 0.5
    assert norm == pytest.approx(1.0, abs=1e-4)


@pytest.mark.model
def test_batched_results_equal_solo_results_position_for_position(embedder):
    # The ordering guarantee, against the real batching path rather than a fake that
    # cannot reorder. Three visibly different images, batched, then alone.
    images = [solid("red"), solid("green"), solid("blue")]

    batched = embedder.embed_images(images)
    solos = [embedder.embed_images([image])[0] for image in images]

    for position, (batched_vector, solo_vector) in enumerate(zip(batched, solos)):
        assert batched_vector == pytest.approx(solo_vector, abs=1e-4), f"position {position}"


@pytest.mark.model
def test_preprocessing_is_wired_up_correctly(embedder):
    # Unit norms prove nothing about preprocessing. This does: CLIP's own mean and std
    # are not ImageNet's, and getting them wrong shifts colour enough that a red image
    # stops preferring the word red — while every other assertion in this file passes.
    image = embedder.embed_images([solid("red")])[0]
    red, blue = embedder.embed_texts(["a solid red image", "a solid blue image"])

    def similarity(a, b):
        return sum(x * y for x, y in zip(a, b))

    assert similarity(image, red) > similarity(image, blue)
