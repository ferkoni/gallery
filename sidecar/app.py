"""ASGI entrypoint: `uvicorn app:app --host 0.0.0.0 --port 8000 --workers 1`.

One worker, always. The GPU is the serialization point, and a second uvicorn worker
loads a second copy of the model — reintroducing exactly the per-process memory
problem this service exists to solve.

The model loads at import, so the process is not listening until the weights are
resident. That is what makes `/health` answering at all mean something, and why the
compose healthcheck carries a long start_period on first boot.
"""

from clip_embedder import ClipEmbedder
from service import create_app

app = create_app(ClipEmbedder.from_env())
