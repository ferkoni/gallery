# How is the streaming zip built and uploaded in Node?

Type: research
Status: open
Blocked by: —

## Question

`Albums::ZipDownload` is the most technically interesting code in the Rails app and the
least mechanical thing to port. Establish what the Node equivalent looks like before anyone
decides how to build it.

Read `~/Documents/docs/gallery/album-download-feature/feature-explanation.md` first — it
documents the current design accurately.

### What the Rails version does

Three streams wired into one pipe, so neither a whole image nor the whole zip is ever
resident:

```
S3 get_object (chunked) → ZipKit::Streamer → S3::MultipartWriter (5 MB parts) → S3 object
```

Specifics that matter for parity:

- Entries are written with `write_stored_file` — **stored, not deflated**. Photos are already
  compressed, and stored framing means the entry size need not be known up front.
- `S3::MultipartWriter` buffers to the 5 MB S3 minimum part size, flushes each part, records
  ETags, and completes the upload; `multipart_put` aborts on any exception so no orphaned
  parts accrue.
- Memory is bounded to roughly one part plus one chunk regardless of album size.
- Duplicate basenames get ` (1)`, ` (2)` suffixes via `unique_name`.
- The key is `downloads/<user_id>/<task_id>/album.zip` — deterministic, so retries overwrite
  rather than orphan. The date-stamped filename lives only in
  `response_content_disposition` on a 15-minute presigned URL.

### Establish

1. Does `@aws-sdk/lib-storage`'s `Upload` accept a readable stream and handle multipart
   buffering, part sizing, ETag tracking, and abort-on-error itself? If so it replaces
   `S3::MultipartWriter` outright — confirm with docs, including its default part size and
   concurrency, and whether concurrency breaks ordering for a zip stream.
2. Which zip library streams entries of unknown size without buffering, and supports stored
   (level 0) entries: `archiver`, `yazl`, `zip-stream`, or something else? Note backpressure
   behaviour — this is where Node differs most from the Ruby version.
3. How `GetObjectCommand`'s response body (a web/Node stream in SDK v3) pipes into that zip
   library without buffering the whole object.
4. Whether the resulting memory profile is genuinely bounded, or whether some layer buffers
   the full archive.

Answer with citations to AWS SDK v3 and library docs.

## Answer
