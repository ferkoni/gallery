"""The two failures the caller has to tell apart.

Rails maps sidecar responses onto an error taxonomy whose only real distinction is
*would running this again help, and what has to change first* — see
`gallery-api/app/services/inference.rb`. These two classes are the sidecar-side halves
of that question, and `service.py` is the only place that turns them into status codes.
"""


class SidecarError(Exception):
    """Base for failures the HTTP layer knows how to report."""


class OutOfMemory(SidecarError):
    """The GPU ran out of memory.

    Retryable, but *only* with a smaller batch — an identical retry is guaranteed to
    fail identically. Reported as 507, which is the sole signal the backfill job (06)
    branches on to halve its batch. Collapsing this into a generic 5xx does not break
    the backfill loudly; it removes the recovery path and retries the same oversized
    batch three times.
    """


class InvalidInput(SidecarError):
    """The payload is unusable: not an image, malformed base64, or too large.

    Never retryable. Reported as 4xx so Rails raises `Inference::InvalidInput` and the
    job fails permanently instead of occupying the queue forever.
    """
