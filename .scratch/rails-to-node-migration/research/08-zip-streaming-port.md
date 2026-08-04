# How the streaming zip is built and uploaded in Node

Research answer for `issues/08-zip-streaming-port.md`.

Sources are **primary only**: the actual TypeScript/JavaScript source of `@aws-sdk/lib-storage`,
`@smithy/*`, `yazl`, `archiver`, `zip-stream`, `compress-commons`, the Node.js `stream` docs in
the nodejs/node repo, and ECMA-262. No blog posts. Every source read is listed at the bottom with
the file and function it came from.

Reference for the behaviour being ported: `gallery-api/app/services/albums/zip_download.rb`,
`gallery-api/app/models/s3/storage.rb` (`#multipart_put`, `#stream_object`),
`gallery-api/app/models/s3/multipart_writer.rb`, and
`~/Documents/docs/gallery/album-download-feature/feature-explanation.md`.

---

## Bottom line

`@aws-sdk/lib-storage`'s `Upload` replaces `S3::MultipartWriter` outright — it takes a Node
`Readable`, buffers it into 5 MB parts, tracks part numbers and ETags, sorts them before
`CompleteMultipartUpload`, and calls `AbortMultipartUpload` on failure with no configuration
needed. Its `queueSize: 4` concurrency does **not** reorder bytes: all four workers pull from a
single async generator, which the language spec forces to run one body execution at a time, so the
input stream is read strictly sequentially and each part carries the part number it was assigned at
read time. For the zip layer use **`yazl`** with `addReadStreamLazy(name, { compress: false }, ...)`
— stored (method 0), size unknown until after the fact via a data descriptor, entries pumped one at a
time, file data moved with `.pipe()` so backpressure is honoured, and the read stream for an entry is
not opened until that entry's turn comes. Pipe `GetObjectCommand`'s `Body` straight in: in Node it is
already a `Readable` (`SdkStream<IncomingMessage>`), narrowable without a cast via
`new S3Client({}) as NodeJsClient<S3Client>`. The end-to-end profile is bounded, but *not* at the
Ruby version's ~5 MB: `Upload` holds up to `partSize * queueSize` = **5 MB × 4 = 20 MB** of parts in
flight, plus one part being accumulated, so budget ~25 MB with defaults (or set `queueSize: 1` for
~10 MB). The one thing that will bite you: **yazl reports errors on the `ZipFile` object, not on
`zipfile.outputStream`** — without an explicit `zip.on("error", e => zip.outputStream.destroy(e))`
a mid-album S3 failure leaves `outputStream` open forever and `upload.done()` never settles.

---

## 1. Does `@aws-sdk/lib-storage`'s `Upload` replace `S3::MultipartWriter`?

**Yes, completely.** Every responsibility of `S3::MultipartWriter` + `S3::Storage#multipart_put` has
a counterpart in `Upload`.

### It accepts a stream

`getChunk()` dispatches on the `Body` type and routes a Node `Readable` to the streaming chunker:

```ts
// lib/lib-storage/src/chunker.ts, getChunk()
if (data instanceof Readable) {
  return getChunkStream<Readable>(data, partSize, getDataReadable);
}
```

The README states the intent explicitly: *"This abstraction enables uploading large files or streams
of unknown size due to the use of multipart uploads under the hood."*
(`lib/lib-storage/README.md`, "Upload").

This matters because plain `PutObjectCommand` cannot take a stream of unknown length. The
content-length middleware sets `content-length` only if the body length is computable and silently
does nothing otherwise (`contentLengthMiddleware()` wraps `bodyLengthChecker(body)` in a
`try { ... } catch (ignored) {}`), and `byteLength()` returns `undefined` for a generic `Readable`
(`lib/lib-storage/src/byteLength.ts` — no `byteLength`/`length`/`size`/`start+end` property and not
an fs read stream ⇒ `undefined`). So multipart is not an optimisation here, it is the only way.

### It does the part sizing and buffering

```ts
// Upload.ts, class fields + constructor
private static MIN_PART_SIZE = 1024 * 1024 * 5;   // 5 MB
private MAX_PARTS = 10_000;                        // "S3 multipart upload does not allow more than 10,000 parts."
private readonly queueSize: number = 4;            // DEFAULT concurrency
...
this.partSize = options.partSize || Math.max(Upload.MIN_PART_SIZE, Math.ceil((this.totalBytes || 0) / this.MAX_PARTS));
```

- **Default `partSize` = 5 MB** (5 × 1024 × 1024 = 5,242,880 bytes). For a stream, `totalBytes` is
  `undefined`, so the `Math.max` collapses to the 5 MB floor. Same constant as
  `S3::MultipartWriter::MIN_PART_SIZE`.
- **Default `queueSize` (concurrency) = 4.**
- `__validateInput()` rejects `partSize < 5 MB` with `EntityTooSmall`, and `queueSize < 1`.
- **Ceiling to be aware of:** `__doConcurrentUpload()` throws
  `Exceeded 10000 parts in multipart upload...`. At the default 5 MB part size that caps an album zip
  at **~50 GB**. Raise `partSize` if albums can exceed that (8 MB ⇒ ~80 GB, 16 MB ⇒ ~160 GB).

`getChunkStream` is the direct analogue of `MultipartWriter#<<`/`#flush_part`:

```ts
// lib/lib-storage/src/chunks/getChunkStream.ts
let partNumber = 1;
for await (const datum of getNextData(data)) {
  currentBuffer.chunks.push(datum);
  currentBuffer.length += datum.byteLength;
  while (currentBuffer.length > partSize) {
    const dataChunk = currentBuffer.chunks.length > 1 ? Buffer.concat(currentBuffer.chunks) : currentBuffer.chunks[0];
    yield { partNumber, data: dataChunk.subarray(0, partSize) };
    currentBuffer.chunks = [dataChunk.subarray(partSize)];
    currentBuffer.length = currentBuffer.chunks[0].byteLength;
    partNumber += 1;
  }
}
yield { partNumber, data: ..., lastPart: true };   // final part exempt from the 5 MB floor
```

### It does the ETag tracking

`__doConcurrentUpload()` pushes `{ PartNumber, ETag, ...checksums }` onto `this.uploadedParts` after
each `UploadPartCommand`, errors if `ETag` is missing, and `__doMultipartUpload()` sorts before
completing:

```ts
this.uploadedParts.sort((a, b) => a.PartNumber! - b.PartNumber!);
result = await this.client.send(new CompleteMultipartUploadCommand({ ..., MultipartUpload: { Parts: this.uploadedParts } }));
```

### Concurrency vs. stream ordering — the critical question

**Concurrency does not reorder or corrupt the byte stream.** Two independent reasons, both from
source:

1. **There is exactly one reader.** `__doMultipartUpload()` creates the chunker *once* and hands the
   *same* generator object to all `queueSize` workers:

   ```ts
   const dataFeeder = getChunk(this.params.Body, this.partSize);
   for (let index = 0; index < this.queueSize; index++) {
     const currentUpload = this.__doConcurrentUpload(dataFeeder).catch(...);
     this.concurrentUploaders.push(currentUpload);
   }
   ```

   Each worker's `for await (const dataPart of dataFeeder)` calls `.next()` on the *same*
   `AsyncGenerator`. Per ECMA-262 §27.9.1.2 `%AsyncGeneratorPrototype%.next`, the request is appended
   to the generator's internal queue via `AsyncGeneratorEnqueue`, and the generator body is resumed
   **only** if its state is `suspended-start` or `suspended-yield`; if it is already `executing`, the
   call just queues (`Assert: state is either executing or draining-queue`). §27.9.3.4 appends to
   `[[AsyncGeneratorQueue]]` and §27.9.3.5 `AsyncGeneratorCompleteStep` removes *the first element* —
   FIFO. So the underlying `Readable` is drained strictly sequentially by one logical reader; only the
   `UploadPart` HTTP calls overlap.

2. **Order is carried in data, not in time.** `partNumber` is assigned inside `getChunkStream` at
   read time and travels with the buffer (`{ partNumber, data }`). Whichever worker happens to send
   it, it goes out as `PartNumber: dataPart.partNumber`, and S3 assembles by part number, not by
   arrival. The pre-complete `sort()` above makes the `Parts` list ascending regardless of completion
   order.

`__validateUploadPart()` additionally asserts every non-last part is exactly `partSize` bytes, which
would catch any chunker misbehaviour loudly rather than silently producing a corrupt zip.

### Abort-on-error — automatic, no configuration required

`leavePartsOnError` **defaults to `false`** (`private readonly leavePartsOnError: boolean = false;`),
and `false` is the "abort for me" setting:

```ts
// Upload.ts, __doMultipartUpload()
await Promise.all(this.concurrentUploaders);
if (concurrentUploaderFailures.length >= 1) {
  await this.markUploadAsAborted();
  throw concurrentUploaderFailures[0];
}

// Upload.ts, markUploadAsAborted()
if (this.uploadId && !this.leavePartsOnError && null !== this.abortMultipartUploadCommand) {
  await this.client.send(this.abortMultipartUploadCommand);
}
```

Note the comment in source: it deliberately waits for **all** uploaders to settle before aborting
"to avoid stranding uploaded parts" — i.e. it is more careful than the Ruby `rescue => e; abort; raise`.
So `await upload.done()` throwing already means the MPU was aborted. Two residual caveats:

- If the process is SIGKILLed, or the `AbortMultipartUpload` call itself fails, parts survive.
  Belt-and-braces: add an S3 lifecycle rule with `AbortIncompleteMultipartUpload` on the
  `downloads/` prefix. (This is an S3 bucket-config feature, not an SDK one; the SDK cannot cover a
  crashed process. `docs.aws.amazon.com/AmazonS3/latest/userguide/mpu-abort-incomplete-mpu-lifecycle-config.html`
  — I could not fetch AWS's doc host in this session, it returns 403 to non-browser clients, so treat
  that URL as the pointer rather than a verified quote.)
- External `upload.abort()` is asynchronous relative to `done()`: `done()` is
  `Promise.race([__doMultipartUpload(), __abortTimeout(signal)])`, so the abort signal rejects
  `done()` immediately while `__doMultipartUpload()` continues in the background and issues the
  `AbortMultipartUpload` later. Don't assume cleanup finished when `done()` rejects from an abort.

**Do not set `ContentLength` in `params` when `Body` is a stream of unknown size.** If `totalBytes`
is defined, `Upload` computes `expectedPartsCount` and throws
`Expected N part(s) but uploaded M part(s).` at the end.

### Retries

`Upload` itself does not retry a part; it relies on the S3 client's standard retry strategy at the
HTTP layer. That works here precisely because `dataPart.data` is a materialised `Buffer` — a retried
`UploadPart` re-sends the same bytes. A hand-rolled writer that streamed part bodies could not be
retried safely. This is a small correctness win over the Ruby version.

---

## 2. Which zip library streams unknown-size, stored entries with proper backpressure?

All three can do stored entries of unknown size, and all three respect backpressure on the bulk data
path (each uses `.pipe()` internally, which is where throttling comes from). They differ in API
shape, error propagation, packaging, and whether they help you avoid opening every S3 socket at once.

### `yazl` — recommended

- **Add an entry from a stream:**
  `zipfile.addReadStream(readStream, "photo.jpg", { compress: false })`, or better
  `zipfile.addReadStreamLazy("photo.jpg", { compress: false }, cb => cb(null, readStream))`.
  Output is read from `zipfile.outputStream` (a `PassThrough`). `zipfile.end()` closes it.
- **Store vs deflate:** `{ compress: false }` (equivalently `{ compressionLevel: 0 }`).
  `determineCompressionLevel()` maps that to level 0, and `pumpFileDataReadStream()` then uses a
  `PassThrough` instead of `zlib.DeflateRaw`:
  ```js
  var compressor = entry.compressionLevel !== 0 ? new zlib.DeflateRaw({level: entry.compressionLevel}) : new PassThrough();
  ```
  README: *"If `compress` is `false`, the file data will be stored (compression method 0)."*
- **Unknown size:** `Entry` is constructed with `crcAndFileSizeKnown = false`, the local file header
  sets general purpose bit 3 (`UNKNOWN_CRC32_AND_FILE_SIZES = 1 << 3`) with zeroed crc/sizes, and a
  16-byte data descriptor is written after the data (`getDataDescriptor()`). This is exactly the
  framing `ZipKit#write_stored_file` produces.
- **Backpressure:** README, `outputStream`: *"Internally, large amounts of file data are piped to
  `outputStream` using `pipe()`, which means throttling happens appropriately when this stream is
  piped to a slow destination."* Confirmed in `pumpFileDataReadStream()`:
  `readStream.pipe(crc32Watcher).pipe(...).pipe(self.outputStream, {end: false})`. Only the small
  fixed-size records (local headers, data descriptors, central directory) go through
  `writeToOutputStream()`, which ignores `write()`'s return value — bounded by entry count, not by
  archive size (~46 bytes + name per entry at the end).
- **One entry at a time:** `pumpEntries()` picks `getFirstNotDoneEntry()` and returns early if an
  entry is `FILE_DATA_IN_PROGRESS`. Combined with `addReadStreamLazy`, the `getReadStreamFunction` is
  not invoked until that entry's turn arrives — so you issue one `GetObject` at a time even though
  you enqueued 5,000 entries up front. README: *"In general, it is recommended to use
  `addReadStreamLazy` ... to avoid holding a large number of system resources open for a long time."*
  This is the single best-fit feature for this port: the naive `addReadStream` version would open
  5,000 concurrent S3 response sockets and blow through the SDK's per-origin `maxSockets` pool.
- **Bonus:** `zipfile.end(options, calculatedTotalSizeCallback)` gives the *exact* final zip size
  before any bytes are consumed, provided every entry is `compress: false` **and** passes a `size`
  option. Since we already know each image's byte size (DB column or `HeadObject`), this is available
  and would let you set `ContentLength`, or serve the zip inline with a real `Content-Length`.
  (`calculateTotalSize()` returns `-1` if any entry deflates or has unknown size.)
- **ZIP64:** automatic when needed — README "Regarding ZIP64 Support": *"yazl automatically uses
  ZIP64 format to support files and archives over 2^32 - 2 bytes (~4GB) in size"*. `useZip64Format()`
  triggers on `relativeOffsetOfLocalHeader > 0xfffffffe`, so multi-GB albums are fine.
- **Packaging:** CommonJS (`package.json` has no `"type"`, `"main": "index.js"`), one dependency
  (`buffer-crc32`). No ESM friction in a CJS NestJS build.
- **Maintenance:** latest **3.3.1, published 2024-11-23**; last repo commit 2026-03-14 (a dependabot
  bump). Quiescent but not abandoned — the API has been stable and `addReadStreamLazy` (3.1.0,
  Oct 2024) was added specifically for the remote-stream use case.
- **The gotcha (important):** errors are emitted on the `ZipFile` **EventEmitter**, not on
  `outputStream`. `pumpFileDataReadStream`/`addReadStreamLazy` do `self.emit("error", err)`;
  `shouldIgnoreAdding()` then short-circuits further adds and `pumpEntries()` returns immediately on
  `self.errored`. Nothing ever ends or destroys `outputStream`. So a failed `GetObject` mid-album
  ⇒ `outputStream` stays open ⇒ `Upload`'s `for await` never terminates ⇒ `upload.done()` hangs
  forever and the MPU is never aborted. Its own changelog concedes *"Error handling isn't very well
  tested."* Fix is one line, and it must be in the port:
  ```ts
  zip.on("error", (err) => zip.outputStream.destroy(err));
  ```

### `zip-stream` — the closest structural match, ESM-only

- **Add an entry:** `zip.entry(source, { name, store: true }, callback)` where `source` is a Buffer or
  a stream. It is itself a `Transform`, so you pipe *it* to the destination.
- **Store vs deflate:** `data.store === true` ⇒ `entry.setMethod(0)` (`zip-stream/index.js`,
  `entry()`); or globally via `new ZipStream({ store: true })` / `{ level: 0 }`, which the constructor
  normalises to `options.store = true`.
- **Unknown size:** `ZipArchiveOutputStream#_appendStream()` unconditionally does
  `ae.getGeneralPurposeBit().useDataDescriptor(true)` before writing the local header, then
  `_afterAppend()` writes the descriptor. Same framing as yazl.
- **Backpressure:** `_smartStream()` ends with `process.pipe(this, { end: false })` and
  `_appendStream()` does `source.pipe(smart)` — honoured.
- **Sequencing is enforced:** `ArchiveOutputStream#entry()` rejects a second entry with
  `"already processing an entry"` while one is in flight, so you *must* drive it with a sequential
  `await`-per-entry loop. That naturally gives the one-GetObject-at-a-time property without a lazy
  API, and reads very much like the Ruby `images.each do |image| ... end`.
- **Error propagation is better than yazl's:** it is a `Transform` and the thing being consumed, so
  an `'error'` on it rejects the consumer's `for await` directly.
- **Packaging:** `"type": "module"`, `"exports": "./index.js"`, `engines: node >= 18` — **ESM-only**
  as of 7.x. From CJS-compiled NestJS you need `await import("zip-stream")`. (6.x was CJS.)
- **Maintenance:** 7.0.5, published 2026-05-08. Actively released.
- **Caveat:** `normalizeInputSource()` wraps any non-`_readableState` stream in a `PassThrough` and
  starts piping into it immediately — harmless for SDK response bodies, which are real Readables.

### `archiver` — `zip-stream` plus a queue and helpers you don't need

- **Add an entry:** `archive.append(readStream, { name, store: true })`; `archive` is a `Transform`
  you pipe onward; `archive.finalize()` closes it.
- **Store vs deflate:** `{ store: true }` per entry or `{ store: true }` on the format options; the
  zip plugin passes them straight to `zip-stream` (`lib/plugins/zip.js`, `append()` ⇒
  `this.engine.entry(source, data, callback)`). Unknown size and backpressure are therefore identical
  to `zip-stream`.
- **Backpressure:** it does `this._module.pipe(this)` (`Archiver#_modulePipe`) and its own
  `_transform` is a pass-through byte counter, so slowness at the destination propagates all the way
  back. It does add a **1 MB** readable buffer of its own: the constructor defaults
  `highWaterMark: 1024 * 1024`.
- **Serialisation:** `this._queue = queue(this._onQueueTask.bind(this), 1)` — concurrency 1, entries
  are processed in order. But `append()` is fire-and-forget, so if you hand it 5,000 live
  `GetObject` bodies up front they are all open while queued. Archiver only solves this for *files*
  (`_updateQueueTaskWithStats` wraps `createReadStream` in a lazystream `Readable`); for our sources
  you'd have to await each entry yourself or wrap in lazystream — i.e. re-implement yazl's
  `addReadStreamLazy`.
- **Packaging:** `"type": "module"`, `engines: node >= 18` — **ESM-only** as of 8.0.0, and 8.0.0
  changed the public API (`import { ZipArchive } from "archiver"`).
- **Maintenance:** 8.0.0, published 2026-05-08. The most actively maintained of the three.
- **Verdict:** archiver's value is `directory()`/`glob()`/`file()` and format plugins. We add entries
  from S3 streams only, so it is pure overhead plus a 1 MB buffer.

### Recommendation

`yazl`, because `addReadStreamLazy` + `{ compress: false }` is a one-for-one match for
`write_stored_file` + `stream_object` including the "open exactly one source at a time" property, and
because it stays CJS. Accept the one-line error-forwarding requirement and cover it with a test that
kills a mid-album `GetObject` and asserts `upload.done()` rejects. If you would rather not hand-wire
error propagation, `zip-stream` 7 driven by a sequential `await`-per-entry loop is the next best
choice and is also a very faithful shape — pay the `await import()` for ESM.

---

## 3. Piping `GetObjectCommand`'s `Body` into the zip without buffering

### The concrete type

`GetObjectCommandOutput.Body` is `StreamingBlobPayloadOutputTypes`, a *union* across runtimes:

```ts
// @smithy/types, packages/types/src/streaming-payload/streaming-blob-payload-output-types.ts
export type StreamingBlobPayloadOutputTypes =
  | NodeJsRuntimeStreamingBlobPayloadOutputTypes    // SdkStream<IncomingMessage | Readable>
  | BrowserRuntimeStreamingBlobPayloadOutputTypes;  // SdkStream<ReadableStream | Blob>
```

`SdkStream<BaseStream> = BaseStream & SdkStreamMixin` (`packages/types/src/serde.ts`), where the
mixin adds `transformToByteArray()`, `transformToString()`, `transformToWebStream()` — all three of
which **collect** the stream and are exactly what you must not call here.

**In Node with the default `NodeHttpHandler`, `Body` is already an `IncomingMessage` — a real
`node:stream.Readable`.** The source comment is explicit: *"This is by default the IncomingMessage
type from node:http responses when using the default node-http-handler in Node.js environments."*
No conversion is needed. It is "not a plain Node stream" only in the *type* sense (the union, plus
the mixin methods bolted on); at runtime it is one.

### The idiom

The officially documented way to drop the union without an `as any` is the `NodeJsClient` type
transform, from `@smithy/types`' own README ("Scenario: Narrowing a smithy-typescript generated
client's output payload blob types"):

```ts
import type { NodeJsClient } from "@smithy/types";
const s3 = new S3Client({ region, credentials }) as NodeJsClient<S3Client>;

// Body is now SdkStream<IncomingMessage>, i.e. a Readable — pipe it directly.
const { Body } = await s3.send(new GetObjectCommand({ Bucket, Key }));
zip.addReadStreamLazy(name, { compress: false }, (cb) => cb(null, Body));
```

The AWS SDK's own `supplemental-docs/TYPESCRIPT.md` ("Why are streaming output values a union type?")
points at exactly that section.

If you ever run with a non-default request handler (fetch/http2) and get a web `ReadableStream`,
convert with `Readable.fromWeb(body as ReadableStream)`; never `transformToByteArray()`.

### Why it doesn't buffer

`IncomingMessage` is a `Readable` with a 64 KiB default `highWaterMark`
(`stream.getDefaultHighWaterMark(false)` ⇒ 65536, per `doc/api/stream.md`). When yazl `.pipe()`s it
into a saturated `outputStream`, `pipe` pauses the source, the socket's read buffer fills, and TCP
backpressure reaches S3. That is the direct equivalent of the Ruby `get_object(...) do |chunk|` block
form — bounded by one chunk.

One operational note: hold **one** response body open at a time. `@smithy/node-http-handler` warns
when `socketsInUse >= maxSockets && requestsEnqueued >= 2 * maxSockets` (`NodeHttpHandler`'s socket
warning path), and `DEFAULT_REQUEST_TIMEOUT = 0` means an idle paused body will *not* be timed out by
the SDK, but the S3 side and any intervening proxy may still drop it. `addReadStreamLazy` gives you
this for free.

---

## 4. Is the memory profile genuinely bounded?

**Yes — bounded, but the constant is bigger than the Ruby version's.** Hop by hop:

| Hop | What it holds | Bounded by |
|---|---|---|
| S3 `GetObject` response body (`IncomingMessage`) | one read buffer | 64 KiB `highWaterMark`; paused by `pipe()` when downstream is full |
| yazl per-entry chain (`Crc32Watcher` → `ByteCounter` → `PassThrough` → counter) | a few chunks in transit | 4 Transforms × 64 KiB ≈ 256 KiB worst case; all connected by `pipe()` |
| `zipfile.outputStream` (`PassThrough`) | zip bytes not yet pulled | 64 KiB `highWaterMark` for file data (piped). Local headers / data descriptors / central directory bypass backpressure via `writeToOutputStream`, so they can exceed it — but by ~(46 + name length) bytes **per entry**, i.e. ~500 KB for a 5,000-image album at the very end, not proportional to archive bytes |
| `Upload` chunker (`getChunkStream`) | one part being accumulated | `partSize` (+ up to one source chunk before the `while` fires) |
| `Upload` in-flight workers | `queueSize` materialised part Buffers awaiting `UploadPart` | **`partSize × queueSize`** |
| S3 destination object | — | nothing local |

**No layer accumulates the full archive.** There is no `Buffer.concat` of the whole stream anywhere,
no temp file, and yazl's central directory is written from the in-memory `entries` array of metadata
(one small object per entry), not from buffered data.

**The number.** `@smithy/lib-storage`'s own type documentation states it plainly:

> *"The size of the concurrent queue manager to upload parts in parallel. Set to 1 for synchronous
> uploading of parts. **Note that the uploader will buffer at most queueSize \* partSize bytes into
> memory at any given time.** default: 4"* — `lib/lib-storage/src/types.ts`, `Configuration.queueSize`

So with defaults: **5 MB × 4 = 20 MB** of parts in flight, **plus** the part currently being
accumulated in `getChunkStream` (another ~5 MB), plus <1 MB of stream buffers ⇒ **~25 MB steady
state**, independent of album size. Ruby's `S3::MultipartWriter` is single-threaded and holds one
5 MB buffer, so it sits at ~5 MB. Options:

- `queueSize: 1` ⇒ ~10 MB (one in flight + one accumulating), closest to Ruby, slowest upload.
- Defaults ⇒ ~25 MB, ~4× the upload throughput. Fine for a background worker; multiply by the number
  of concurrent album-download jobs when sizing the container.
- Raising `partSize` to lift the 50 GB ceiling multiplies both numbers: `partSize: 16 MB` with
  `queueSize: 4` is ~80 MB resident.

Also note the growth that *is* unbounded, exactly as in Ruby: the number of `UploadPart` round-trips,
and yazl's `entries` array (one metadata object per image, needed to emit the central directory).
Neither scales with bytes.

---

## Code sketch

```ts
import { basename } from "node:path";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import type { NodeJsClient } from "@smithy/types";
import { ZipFile } from "yazl";

// Narrow Body to SdkStream<IncomingMessage> (a Readable) — @smithy/types README.
const s3 = new S3Client({ region, credentials }) as NodeJsClient<S3Client>;

export async function streamAlbumZip(bucket: string, imageKeys: string[], destKey: string) {
  const zip = new ZipFile();

  // MANDATORY: yazl emits errors on the ZipFile, never on outputStream. Without this a
  // failed GetObject leaves outputStream open and upload.done() never settles.
  zip.on("error", (err) => zip.outputStream.destroy(err));

  const seen = new Map<string, number>();
  for (const key of imageKeys) {
    // Lazy: the GetObject socket opens only when this entry's turn comes, so exactly one
    // response body is live at a time (yazl pumps entries strictly one at a time).
    zip.addReadStreamLazy(uniqueName(basename(key), seen), { compress: false }, (cb) => {
      s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
        .then((res) => cb(null, res.Body!))   // compress:false => STORED + data descriptor
        .catch(cb);
    });
  }
  zip.end();

  const upload = new Upload({
    client: s3,
    params: { Bucket: bucket, Key: destKey, Body: zip.outputStream, ContentType: "application/zip" },
    // NOTE: never set ContentLength here — Upload would assert an expected part count.
    partSize: 8 * 1024 * 1024,  // 8 MiB x 10,000 parts => ~80 GB ceiling (5 MiB default => ~50 GB)
    queueSize: 4,               // ~partSize*queueSize resident; use 1 to match Ruby's ~5 MB
    // leavePartsOnError defaults to false => AbortMultipartUpload runs automatically on failure
  });

  await upload.done();          // rejects only after the MPU has been aborted
  return destKey;               // caller presigns: 900s + response-content-disposition
}

// Port of Albums::ZipDownload#unique_name — "photo.jpg", "photo (1).jpg", ...
function uniqueName(name: string, seen: Map<string, number>): string {
  const n = seen.get(name) ?? 0;
  seen.set(name, n + 1);
  if (n === 0) return name;
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? `${name} (${n})` : `${name.slice(0, dot)} (${n})${name.slice(dot)}`;
}
```

Parity checklist against the Rails version:

| Rails | Node |
|---|---|
| `S3::Storage#multipart_put` (create/complete/abort) | `new Upload(...)` + `await upload.done()` |
| `S3::MultipartWriter` (5 MB buffer, ETags) | `getChunkStream` + `Upload.uploadedParts` |
| `ZipKit::Streamer#write_stored_file` | `zip.addReadStreamLazy(name, { compress: false }, ...)` |
| `S3::Storage#stream_object` block form | `res.Body` (`Readable`) piped by yazl |
| `unique_name` | `uniqueName` above |
| stable key `downloads/<user>/<task>/album.zip` | unchanged — deterministic, retries overwrite |
| `presigned_get_url(expires_in: 900, response_content_disposition:)` | `@aws-sdk/s3-request-presigner` `getSignedUrl(..., { expiresIn: 900 })` with `ResponseContentDisposition` on the `GetObjectCommand` |

Tests worth writing (they cover the two failure modes source review flagged): (a) a mid-album
`GetObject` rejection must reject `upload.done()` within a timeout and must have issued
`AbortMultipartUpload`; (b) an album whose zip exceeds `partSize` must produce ≥2 parts with ascending
`PartNumber`s and a byte-identical round-trip through a real unzip.

---

## Sources

Read directly as source, not summarised from elsewhere.

**`@aws-sdk/lib-storage` (aws/aws-sdk-js-v3, `main`)**
- `lib/lib-storage/src/Upload.ts` — `MIN_PART_SIZE = 5 MB`, `MAX_PARTS = 10_000`, `queueSize = 4`,
  `leavePartsOnError = false`, `partSize` derivation in the constructor, `__doMultipartUpload()`
  (single shared `dataFeeder`, worker fan-out, `uploadedParts.sort`), `__doConcurrentUpload()`
  (part-number propagation, ETag capture), `markUploadAsAborted()`, `__validateInput()`,
  `__validateUploadPart()`, `done()`/`abort()`/`__abortTimeout()`.
  https://github.com/aws/aws-sdk-js-v3/blob/main/lib/lib-storage/src/Upload.ts
- `lib/lib-storage/src/chunker.ts` — `getChunk()` dispatch, `Readable` ⇒ `getChunkStream`.
  https://github.com/aws/aws-sdk-js-v3/blob/main/lib/lib-storage/src/chunker.ts
- `lib/lib-storage/src/chunks/getChunkStream.ts` — sequential `partNumber`, exact-`partSize` slicing,
  `lastPart`. https://github.com/aws/aws-sdk-js-v3/blob/main/lib/lib-storage/src/chunks/getChunkStream.ts
- `lib/lib-storage/src/chunks/getDataReadable.ts` — `for await` over the `Readable`.
- `lib/lib-storage/src/types.ts` — `Configuration.queueSize` doc comment: *"the uploader will buffer
  at most queueSize \* partSize bytes into memory at any given time"*; `partSize` default 5 MB;
  `leavePartsOnError` default false.
  https://github.com/aws/aws-sdk-js-v3/blob/main/lib/lib-storage/src/types.ts
- `lib/lib-storage/src/byteLength.ts` — returns `undefined` for a generic `Readable`.
- `lib/lib-storage/README.md` — "Upload" section: stream support, streams of unknown size, default
  `queueSize: 4` / `partSize: 5 MB` / `leavePartsOnError: false`.
  https://github.com/aws/aws-sdk-js-v3/blob/main/lib/lib-storage/README.md
- `supplemental-docs/TYPESCRIPT.md` — "Why are streaming output values a union type?".
  https://github.com/aws/aws-sdk-js-v3/blob/main/supplemental-docs/TYPESCRIPT.md

**`@smithy/*` (smithy-lang/smithy-typescript, `main`)**
- `packages/types/src/streaming-payload/streaming-blob-payload-output-types.ts` —
  `StreamingBlobPayloadOutputTypes`, `NodeJsRuntimeStreamingBlobPayloadOutputTypes = SdkStream<IncomingMessage | Readable>`.
  https://github.com/smithy-lang/smithy-typescript/blob/main/packages/types/src/streaming-payload/streaming-blob-payload-output-types.ts
- `packages/types/src/serde.ts` — `SdkStreamMixin` (`transformToByteArray`/`String`/`WebStream`),
  `SdkStream<BaseStream>`.
- `packages/types/src/transform/client-payload-blob-type-narrow.ts` — `NodeJsClient<ClientType>`.
- `packages/types/README.md` — "Scenario: Narrowing a smithy-typescript generated client's output
  payload blob types" (the `as NodeJsClient<S3Client>` idiom).
  https://github.com/smithy-lang/smithy-typescript/tree/main/packages/types#scenario-narrowing-a-smithy-typescript-generated-clients-output-payload-blob-types
- `packages/node-http-handler/src/node-http-handler.ts` — `DEFAULT_REQUEST_TIMEOUT = 0`, maxSockets
  saturation warning.
- `packages/core/src/submodules/protocols/middleware-content-length/contentLengthMiddleware.ts` —
  `content-length` silently skipped when body length is indeterminable.

**`yazl` 3.3.1 (thejoshwolfe/yazl, `master`)**
- `index.js` — `addReadStream`/`addReadStreamLazy`, `determineCompressionLevel`,
  `pumpFileDataReadStream` (PassThrough for level 0; `.pipe(outputStream, {end:false})`),
  `pumpEntries` (one entry at a time), `Entry` (`crcAndFileSizeKnown = false`),
  `getLocalFileHeader` (`UNKNOWN_CRC32_AND_FILE_SIZES = 1 << 3`), `getDataDescriptor`,
  `useZip64Format`, `shouldIgnoreAdding`, `writeToOutputStream`, `calculateTotalSize`.
  https://github.com/thejoshwolfe/yazl/blob/master/index.js
- `README.md` — `compress: false` ⇒ method 0; `addReadStreamLazy` recommendation; `outputStream`
  backpressure note; `calculatedTotalSizeCallback`; "Regarding ZIP64 Support"; change history
  (3.1.0 added `addReadStreamLazy`, *"Error handling isn't very well tested"*).
  https://github.com/thejoshwolfe/yazl/blob/master/README.md
- npm registry `registry.npmjs.org/yazl` — latest 3.3.1, published 2024-11-23.

**`archiver` 8.0.0 / `zip-stream` 7.0.5 / `compress-commons` 7.0.1 (archiverjs, `master`)**
- `node-archiver/lib/core.js` — `highWaterMark: 1024 * 1024`, `queue(..., 1)`, `_modulePipe()`
  (`this._module.pipe(this)`), `_moduleAppend()`, `_transform()`, `_updateQueueTaskWithStats()`
  (lazystream for files). https://github.com/archiverjs/node-archiver/blob/master/lib/core.js
- `node-archiver/lib/plugins/zip.js` — `store: false` default, `append()` ⇒ `engine.entry()`.
- `node-zip-stream/index.js` — `entry()`, `data.store` ⇒ `entry.setMethod(0)`, `{ level: 0 }` ⇒
  `store: true`. https://github.com/archiverjs/node-zip-stream/blob/master/index.js
- `node-compress-commons/lib/archivers/zip/zip-archive-output-stream.js` — `_appendStream()`
  (`useDataDescriptor(true)`), `_smartStream()` (`process.pipe(this, {end:false})`), `_afterAppend()`,
  `_finish()`.
- `node-compress-commons/lib/archivers/archive-output-stream.js` — `entry()` ("already processing an
  entry"), `ArchiveOutputStream extends Transform`.
- `node-compress-commons/lib/util/index.js` — `normalizeInputSource()`.
- `package.json` for each — `"type": "module"`, `engines.node >= 18`; npm registry: archiver 8.0.0 and
  zip-stream 7.0.5 both published 2026-05-08.

**Language / runtime specs**
- ECMA-262, §27.9.1.2 `%AsyncGeneratorPrototype%.next`, §27.9.3.4 `AsyncGeneratorEnqueue`,
  §27.9.3.5 `AsyncGeneratorCompleteStep` — requests are appended to `[[AsyncGeneratorQueue]]` and the
  body resumes only from `suspended-start`/`suspended-yield`; completion steps remove the *first*
  element (FIFO). https://tc39.es/ecma262/multipage/control-abstraction-objects.html#sec-asyncgeneratorenqueue
- Node.js `doc/api/stream.md` — `stream.getDefaultHighWaterMark(objectMode)` defaults to 65536
  (64 KiB). https://github.com/nodejs/node/blob/main/doc/api/stream.md

**Not verified in this session:** `docs.aws.amazon.com` returns HTTP 403 to non-browser clients, so
the S3 User Guide pages on multipart-upload semantics and the `AbortIncompleteMultipartUpload`
lifecycle rule are cited as pointers only. Every S3-behaviour claim above is instead grounded in the
SDK source (part-size floor, 10,000-part cap, ascending part-number assembly via the pre-complete
`sort`, automatic `AbortMultipartUpload`).
