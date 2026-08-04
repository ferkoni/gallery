# How is the streaming zip built and uploaded in Node?

Type: research
Status: resolved
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

**Recommended stack: `GetObjectCommand.Body` (already a Node `Readable`) → `yazl` →
`@aws-sdk/lib-storage`'s `Upload`.** Full findings, with a 40-line wiring sketch, cited to
lib-storage source and ECMA-262:
[`../research/08-zip-streaming-port.md`](../research/08-zip-streaming-port.md).

1. **`Upload` replaces `S3::MultipartWriter` outright.** It accepts a Node `Readable`, chunks
   it into parts (default `partSize` 5 MB, `queueSize` 4), tracks part numbers and ETags, and
   sorts them before `CompleteMultipartUpload`. `leavePartsOnError` defaults to `false`, so
   `AbortMultipartUpload` fires automatically on error — no configuration needed, and no
   orphaned parts.

   **Concurrency does not reorder the byte stream**, which was the load-bearing worry.
   `__doMultipartUpload` creates one chunker generator and hands the *same* generator object
   to all four workers; per ECMA-262 §27.9.1.2 / §27.9.3.4-5, concurrent `next()` calls queue
   FIFO and the body only resumes from a suspended state. So the stream is drained
   sequentially by one logical reader, `partNumber` is stamped at read time and travels with
   the buffer, and only the `UploadPart` HTTP calls overlap.
2. **Zip layer: `yazl`.** `addReadStreamLazy(name, { compress: false }, cb)` gives stored
   (method 0) framing with a data descriptor for unknown size — the direct analogue of
   `write_stored_file`. Entries are pumped strictly one at a time and the read stream is not
   opened until that entry's turn, so exactly one `GetObject` socket is live at any moment. It
   moves file data with `.pipe()`, so backpressure propagates all the way to S3. `zip-stream`
   is the closest structural match but is ESM-only; `archiver` is `zip-stream` plus a queue
   and helpers this use case does not need.
3. **`GetObjectCommand`'s `Body` is already a Node `Readable`** (`SdkStream<IncomingMessage>`).
   Narrow it with `new S3Client({}) as NodeJsClient<S3Client>` from `@smithy/types`, and never
   call `transformTo*` — those buffer the whole object.
4. **Memory is bounded, but at ~25 MB, not ~5 MB.** lib-storage's own `types.ts` states the
   uploader buffers at most `queueSize * partSize` — 20 MB in flight plus one accumulating
   part. Set `queueSize: 1` to match the Ruby profile.

### The gotcha that must not be missed

**`yazl` emits errors on the `ZipFile` EventEmitter, never on `zipfile.outputStream`, and
never destroys it.** So a `GetObject` that fails mid-album leaves `outputStream` open,
`Upload`'s `for await` never terminates, and `upload.done()` hangs forever with the multipart
upload un-aborted. One mandatory line prevents it:

```js
zip.on("error", e => zip.outputStream.destroy(e));
```

Secondary constraints: the 10,000-part cap means a ~50 GB ceiling at the default part size,
and never set `ContentLength` alongside a stream `Body` — `Upload` will assert an expected
part count.
