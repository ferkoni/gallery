# ActiveRecord Encryption on-disk format, and whether Node can read it

Research for issue `02-ar-encryption-envelope`. Target: `S3Credential#access_key_id` /
`#secret_access_key` in `gallery-api`, Rails **8.1.3**, `config.load_defaults 8.1`.

All source citations are to the gem actually resolved by this project's gemset:

```
/usr/share/rvm/gems/ruby-3.4.9@gallery/gems/activerecord-8.1.3/lib/active_record/encryption/
```

(confirmed via `Gemfile.lock` → `activerecord (8.1.3)`, `.ruby-gemset` → `gallery`).
Paths below are abbreviated to `AR_ENC/` for that directory.

Confirmed preconditions:

- `/home/fernando/Documents/gallery/gallery-api/app/models/s3_credential.rb` declares
  `encrypts :access_key_id` and `encrypts :secret_access_key` — **no `deterministic: true`**.
- `/home/fernando/Documents/gallery/gallery-api/db/schema.rb` lines 56 and 60: both columns
  are `t.text`, `null: false` — no `limit`, so `EncryptableRecord#validate_column_size`
  (`AR_ENC/encryptable_record.rb:138`) adds no length validation.
- `/home/fernando/Documents/gallery/gallery-api/config/application.rb:12,21-23`:
  `config.load_defaults 8.1`, keys wired from `ACTIVE_RECORD_ENCRYPTION_PRIMARY_KEY`,
  `..._DETERMINISTIC_KEY`, `..._KEY_DERIVATION_SALT`. All three are present in `.env`,
  32 characters each (the `bin/rails db:encryption:init` shape).

---

## Bottom line

**Yes — Node can read and write this format faithfully, and I proved it end-to-end.** The
envelope is plain JSON (`{"p":…,"h":{"iv":…,"at":…}}`) with base64 fields, the cipher is
AES-256-GCM with a 12-byte IV and a 16-byte tag stored as separate headers, and the key is a
straight `PBKDF2-HMAC-SHA256(primary_key, key_derivation_salt, 65536, 32)`. Every primitive
is in `node:crypto` + `node:zlib`. I wrote a ~30-line ES module, had Rails 8.1.3 encrypt
values and Node decrypt them, then had Node encrypt values and Rails decrypt them — both
directions round-tripped, including the compressed (>140 byte) case. See
[Q4](#4-does-any-published-nodetypescript-library-read-this-format) for the transcript.

**But no npm package implements it** (I searched the registry; nothing), and **Rails does not
document the format as an external contract** — the guide describes the JSON shape but never
states the KDF parameters, and the one and only source-of-truth for iterations/digest/output
length is the Ruby source. Rails has already broken cross-version key derivation once
(SHA-1 → SHA-256 default in 7.1, requiring the
`support_sha1_for_non_deterministic_encryption` escape hatch), which is exactly the class of
change that would silently break a Node reader on a future Rails upgrade.

**The single most important caveat:** the risk is not the parser, it's the *key derivation
defaults*. The bytes on disk have been stable from Rails 7.0 to 8.1 (verified by diffing the
two gems), but the PBKDF2 digest silently changed with `load_defaults` in 7.1 and is
configuration-dependent, not envelope-recorded — nothing in the stored payload tells a reader
which digest produced the key. So a Node reader must hardcode "SHA-256, 65536, 32 bytes" as an
assumption it cannot verify from the data.

Practical recommendation: **the format is not the reason to migrate the data.** Node reading it
is genuinely tractable (a day's work including tests). The reason to prefer a neutral scheme in
ticket 03 is maintenance coupling — you'd be pinning a Node module to undocumented Rails
internals for a table with exactly two encrypted columns and, presumably, a handful of rows.
Whichever shape ticket 03 picks, do it as a **read-old / write-new** dual-path migration with
the Ruby side still able to decrypt, never a destructive in-place rewrite.

---

## 1. Exactly what bytes does Rails 8.1 write into an `encrypts` column?

### 1.1 Outer encoding: raw JSON text, **not** base64

The stored column value is the literal UTF-8 JSON string. There is no outer base64 layer.

- `AR_ENC/encryptor.rb`, `Encryptor#encrypt` (line 51) ends with
  `serialize_message build_encrypted_message(...)`; `#serialize_message` (line 135) is just
  `serializer.dump(message)`.
- The serializer comes from the encryption `Context`:
  `AR_ENC/context.rb`, `Context#set_defaults` (line 29) sets
  `self.message_serializer = ActiveRecord::Encryption::MessageSerializer.new`. That is the JSON
  serializer, and it is still the default in 8.1 — `railties-8.1.3`'s
  `Rails::Application::Configuration#load_defaults` sets no
  `active_record.encryption.message_serializer` at any version
  (`grep -n "encryption" railties-8.1.3/lib/rails/application/configuration.rb` returns only
  lines 288–289, the digest settings).
- `AR_ENC/message_serializer.rb`, `MessageSerializer#dump` (line 31) is
  `JSON.dump message_to_json(message)`, and `#binary?` (line 36) returns `false`.
- Because the serializer is non-binary and the cast type is a plain string,
  `AR_ENC/encrypted_attribute_type.rb`, `EncryptedAttributeType#text_to_database_type`
  (line 166) passes the string through unchanged. Base64 wrapping only happens for binary
  columns.

> **Guide vs. source.** The guide's storage section says "the payload itself is Base64-encoded
> so it can fit safely in text-based columns"
> (`guides/source/active_record_encryption.md` v8.1.3, §"Important: Storage Considerations",
> line 136). That refers to the **inner** base64 of the payload/header values, not an outer
> encoding of the whole envelope. The `Encryptor#encrypt` doc comment in the source itself is
> worse — it claims the serializer is "`ActiveRecord::Encryption::SafeMarshal` by default" and
> that step 4 is "Encode the result with Base64" (`AR_ENC/encryptor.rb:39-40`). **Both claims
> are false in 8.1.3.** There is no `SafeMarshal` class in the gem, and there is no step 4.
> Trust the code path, not the comment.

### 1.2 Envelope structure

```json
{"p":"<base64 ciphertext>","h":{"iv":"<base64 12 bytes>","at":"<base64 16 bytes>"}}
```

- Top level has exactly two keys, `p` (payload) and `h` (headers) —
  `AR_ENC/message_serializer.rb`, `MessageSerializer#message_to_json` (line 64).
- `AR_ENC/message_serializer.rb`, `#encode_if_needed` (line 77): **every `String` value** —
  the payload and each header value — is `Base64.strict_encode64`'d. Non-string values
  (booleans, numbers, nested messages) are **not** encoded.
- On the way back in, `#decode_if_needed` (line 85) is `Base64.strict_decode64`, and
  `#validate_message_data_format` (line 46) rejects anything that isn't a Hash with a `"p"`
  key, and rejects header nesting deeper than one level.

### 1.3 Header keys

The short keys are defined once, in `AR_ENC/properties.rb`,
`Properties::DEFAULT_PROPERTIES` (line 23):

| Key  | Meaning                 | Type on the wire                        | Present for this app? |
|------|-------------------------|-----------------------------------------|-----------------------|
| `iv` | initialization vector   | base64 string, 12 raw bytes             | **always**            |
| `at` | GCM auth tag            | base64 string, 16 raw bytes             | **always**            |
| `c`  | payload was compressed  | JSON boolean `true` (**not** base64)    | only if >140 bytes    |
| `e`  | Ruby encoding name      | base64 string, e.g. `"ASCII-8BIT"`      | only if not UTF-8     |
| `k`  | encrypted data key      | **nested `{"p":…,"h":…}` object**       | no (see below)        |
| `i`  | encrypted data key id   | base64 string, 4 hex chars              | no (see below)        |

- `c` is set by `AR_ENC/encryptor.rb`, `#build_encrypted_message` (line 131):
  `message.headers.compressed = true if was_compressed`. Since `true` is not a `String`,
  `encode_if_needed` leaves it as a JSON boolean. **A parser must treat `h.c` as a boolean,
  not a base64 string.**
- `e` is set by `AR_ENC/cipher.rb`, `Cipher#encrypt` (line 17):
  `message.headers.encoding = clean_text.encoding.name unless clean_text.encoding == UTF_8`.
  On decrypt, `Cipher#decrypt` (line 27) does `force_encoding(headers.encoding || UTF_8)`.
- `k` / `i` come from `AR_ENC/envelope_encryption_key_provider.rb` and
  `AR_ENC/key_provider.rb:22`. **Neither appears here:** the default key provider is
  `DerivedSecretKeyProvider`, not the envelope one
  (`AR_ENC/context.rb`, `#build_default_key_provider`, line 37), and
  `store_key_references` defaults to `false`
  (`AR_ENC/config.rb`, `Config#set_defaults`, line 50). A Node parser should **fail loudly**
  if it ever sees `k` or `i`, since those mean a different key hierarchy than it implements.
- Header ordering in the emitted JSON is insertion order: `iv`, `at` (both set in
  `Aes256Gcm#encrypt`), then `k`/`i` if any, then `c`. Order is irrelevant for reading and,
  because this attribute is non-deterministic, irrelevant for writing too (see Q3).

### 1.4 Cipher, IV, and auth tag

`AR_ENC/cipher/aes256_gcm.rb`, `class Aes256Gcm`:

- `CIPHER_TYPE = "aes-256-gcm"` (line 15).
- `.key_length` → `OpenSSL::Cipher.new("aes-256-gcm").key_len` = **32 bytes** (line 18).
- `.iv_length` → `…iv_len` = **12 bytes** (line 22).
- `#encrypt` (line 34): `cipher.key = @secret`, `iv = generate_iv(...)`, `cipher.iv = iv`,
  `update` + `final`. The IV goes to `message.headers.iv` and `cipher.auth_tag` to
  `message.headers.auth_tag` (lines 50–51). **Neither is prepended or appended to the
  ciphertext.** The payload `p` is the bare ciphertext, nothing else.
- **No AAD is set on encryption.** `#decrypt` sets `cipher.auth_data = ""` (line 72), which is
  the OpenSSL default anyway. So the headers are *not* authenticated — the GCM tag covers the
  ciphertext only. In Node, simply do not call `setAAD`.
- `#decrypt` hard-rejects a tag that isn't exactly 16 bytes (line 63), with an explicit comment
  citing https://github.com/ruby/openssl/issues/63 (truncated-tag forgery). A Node reader
  should replicate this check; `crypto.createDecipheriv` accepts short tags for GCM unless you
  pass `authTagLength`.
- Empty-string edge case: `clear_text.empty? ? clear_text.dup : cipher.update(clear_text)`
  (line 46) — an empty plaintext yields an empty payload but still a valid IV and tag.

### 1.5 Compression sits *inside* the encryption

`AR_ENC/encryptor.rb`:

- `THRESHOLD_TO_JUSTIFY_COMPRESSION = 140.bytes` (line 109).
- `#compress_if_worth_it` (line 150): compress only `if compress? && string.bytesize > 140`.
- Compression happens in `#build_encrypted_message` (line 128) **before** `cipher.encrypt`, so
  the ciphertext decrypts to *compressed* bytes when `h.c` is true.
- The compressor defaults to `Zlib` — `AR_ENC/config.rb:59`, `self.compressor = Zlib`. Ruby's
  `Zlib.deflate` emits RFC-1950 zlib-wrapped deflate, which is exactly `zlib.inflateSync` /
  `zlib.deflateSync` in Node (verified in Q4 — Ruby inflated Node's deflate output and vice
  versa).
- Practical note for this table: AWS access key IDs are 20 chars and secret access keys are 40
  chars, both well under 140 bytes, so **`h.c` will never appear on these two columns** in
  practice. Implement it anyway; it's four lines.

The threshold carries this comment verbatim (line 98): *"This threshold cannot be changed."* —
because deterministic lookups depend on the presence/absence of the `c` header being stable.

### 1.6 Observed output (Rails 8.1.3, dummy keys, non-deterministic)

Produced by running `ActiveRecord::Encryption::Encryptor#encrypt` directly against the gemset,
no database involved:

```
value: "AKIAIOSFODNN7EXAMPLE"  (20 bytes)
stored: {"p":"eClz5AI+yzOPsoV68ln4RgQVi1w=","h":{"iv":"XzLIaxWRXdJwEBvn","at":"biLjCbN1IuaKgsr/nK70uA=="}}
stored length: 98 bytes
decoded payload: 20 bytes   decoded iv: 12 bytes   decoded at: 16 bytes
```

Overhead is a constant **78 bytes** for a short uncompressed value (JSON scaffolding + base64
of a 12-byte IV and 16-byte tag), plus base64 expansion of the ciphertext. The guide's "around
255 bytes" figure (§"Important: Storage Considerations") is explicitly qualified as
*"When using the built-in envelope encryption key provider"*, which this app does not use.

Other observed header shapes:

```
200-byte value      → headers: ["iv","at","c"],  h["c"] == true   (JSON boolean)
ASCII-8BIT input    → headers: {"iv":…, "at":…, "e":"QVNDSUktOEJJVA=="}   (base64 of "ASCII-8BIT")
same value twice    → different envelopes (non-deterministic)
```

### 1.7 Parser pseudocode

```
env      = JSON.parse(column)                 // must be an object with "p"
ct       = base64_decode(env.p)
iv       = base64_decode(env.h.iv)            // require 12 bytes
tag      = base64_decode(env.h.at)            // require exactly 16 bytes
reject if env.h.k or env.h.i present          // different key hierarchy
plain    = AES-256-GCM_decrypt(key, iv, ct, tag, aad = empty)
plain    = zlib_inflate(plain) if env.h.c === true
encoding = env.h.e ? base64_decode(env.h.e) : "UTF-8"
```

---

## 2. Key derivation from `ACTIVE_RECORD_ENCRYPTION_PRIMARY_KEY` and `..._KEY_DERIVATION_SALT`

### 2.1 The call chain

1. `AR_ENC/context.rb`, `Context#build_default_key_provider` (line 37):
   `DerivedSecretKeyProvider.new(ActiveRecord::Encryption.config.primary_key)`.
2. `AR_ENC/derived_secret_key_provider.rb`, `#derive_key_from` (line 12):
   `Key.new(key_generator.derive_key_from(password))`.
3. `AR_ENC/key_generator.rb`, `KeyGenerator#derive_key_from` (line 38):
   ```ruby
   ActiveSupport::KeyGenerator.new(password, hash_digest_class: hash_digest_class)
     .generate_key(key_derivation_salt, length)
   ```
   where `length` defaults to `ActiveRecord::Encryption.cipher.key_length` = **32**
   (`#key_length`, line 48 → `Cipher#key_length`, `AR_ENC/cipher.rb:31` → `Aes256Gcm.key_length`).
4. `activesupport-8.1.3/lib/active_support/key_generator.rb`,
   `ActiveSupport::KeyGenerator#initialize` (line 28): `@iterations = options[:iterations] || 2**16`
   — AR never passes `:iterations`, so it is always **65536**.
5. Same file, `#generate_key` (line 41):
   ```ruby
   OpenSSL::PKCS5.pbkdf2_hmac(@secret, salt, @iterations, key_size, @hash_digest_class.new)
   ```

### 2.2 The parameters

| Parameter    | Value                                                            | Source |
|--------------|------------------------------------------------------------------|--------|
| KDF          | **PBKDF2-HMAC**                                                  | `active_support/key_generator.rb:42`, `OpenSSL::PKCS5.pbkdf2_hmac` |
| Password     | raw bytes of `ACTIVE_RECORD_ENCRYPTION_PRIMARY_KEY`               | `config/application.rb:21` → `Config#primary_key` |
| Salt         | raw bytes of `ACTIVE_RECORD_ENCRYPTION_KEY_DERIVATION_SALT` (used as-is, no decoding) | `AR_ENC/key_generator.rb:44` |
| Iterations   | **65536** (`2**16`)                                              | `active_support/key_generator.rb:32` |
| Hash         | **SHA-256** for this app                                          | see 2.3 |
| Output length| **32 bytes**                                                     | `AR_ENC/key_generator.rb:38,48` + `Aes256Gcm.key_length` |

Node equivalent:

```js
crypto.pbkdf2Sync(PRIMARY_KEY, KEY_DERIVATION_SALT, 65536, 32, "sha256")
```

This key is used **directly** as the AES-256-GCM key. There is no second wrapping layer, no
per-record data key, no salt stored in the envelope. One key for every row, forever, until the
primary key is rotated.

### 2.3 The digest is a *configuration* default, not a property of the data

`AR_ENC/config.rb`, `Config#set_defaults` (line 58) hardcodes
`self.hash_digest_class = OpenSSL::Digest::SHA1`. That bare default is **overridden by
`load_defaults`**: `railties-8.1.3/lib/rails/application/configuration.rb:288`, inside the
`"7.1"` branch, sets `active_record.encryption.hash_digest_class = OpenSSL::Digest::SHA256`.
Because `gallery-api` uses `config.load_defaults 8.1`, which cascades through 7.1, **this app
derives with SHA-256.**

Line 289 of the same file sets
`active_record.encryption.support_sha1_for_non_deterministic_encryption = false`. When that is
`true` (the pre-7.1 default, and also the default when calling
`ActiveRecord::Encryption.configure` directly —
`AR_ENC/configurable.rb:27`), `Config#support_sha1_for_non_deterministic_encryption=`
(`AR_ENC/config.rb:27`) registers an *additional previous scheme* whose key provider derives
with SHA-1, so Rails transparently tries both keys on decrypt. With `load_defaults 8.1` it is
`false`, so **only the SHA-256 key is ever tried.** A Node reader therefore needs exactly one
key — but this is the fact most likely to be wrong if the app's `load_defaults` ever changes.

Officially documented in `guides/source/configuring.md` v8.1.3,
§`config.active_record.encryption.hash_digest_class` (line 1799) and
§`config.active_record.encryption.support_sha1_for_non_deterministic_encryption` (line 1810),
both with the "(original) → 7.1" default-value tables.

I confirmed the SHA-1/SHA-256 distinction empirically: my first probe run derived with SHA-1
(config applied after `Context` construction) and the manually-computed SHA-256 key produced
`OpenSSL::Cipher::CipherError` on `final`. Once `hash_digest_class:` was passed through
`configure` — which calls `reset_default_context` after applying properties
(`AR_ENC/configurable.rb:33`) — the manual SHA-256 PBKDF2 key decrypted the payload cleanly.

### 2.4 `ACTIVE_RECORD_ENCRYPTION_DETERMINISTIC_KEY` — **not involved here**

`AR_ENC/scheme.rb`, `Scheme#key_provider` (line 57) resolves in this order:
explicit `key_provider:` → `key:` → `deterministic_key_provider` → `default_key_provider`. The
third branch, `#deterministic_key_provider` (line 96), is guarded by `if @deterministic` and is
the only consumer of `ActiveRecord::Encryption.config.deterministic_key`. Since `S3Credential`
declares no `deterministic: true`, `@deterministic` is `nil`, and the resolution falls through
to `default_key_provider` → the primary-key-derived `DerivedSecretKeyProvider`.

So: **`ACTIVE_RECORD_ENCRYPTION_DETERMINISTIC_KEY` is dead weight for these two columns.** It
matters only for attributes declared `deterministic: true` (used to make `find_by_email`-style
queries possible). It is derived the same way — `DeterministicKeyProvider < DerivedSecretKeyProvider`
(`AR_ENC/deterministic_key_provider.rb:6`), same PBKDF2 params, different password — and it
explicitly forbids rotation (`raise … "Deterministic encryption keys can't be rotated"`, line 9).
A Node port for *this* table can ignore it entirely; it must not be confused for the primary key.

Also note: `primary_key` may be an **array** for rotation (`KeyProvider#decryption_keys`,
`AR_ENC/key_provider.rb:32`, returns all keys and `Cipher#try_to_decrypt_with_each`,
`AR_ENC/cipher.rb:40`, tries each in turn). A faithful Node reader should accept a list and try
each, encrypting with the last.

---

## 3. Non-deterministic vs. deterministic — what changes, and does it matter to a reader?

**It changes exactly one thing: how the IV is produced.** Nothing else.

`AR_ENC/cipher/aes256_gcm.rb`, `#generate_iv` (line 87):

```ruby
def generate_iv(cipher, clear_text)
  if @deterministic
    generate_deterministic_iv(clear_text)
  else
    cipher.random_iv
  end
end

def generate_deterministic_iv(clear_text)
  OpenSSL::HMAC.digest(OpenSSL::Digest::SHA256.new, @secret, clear_text)[0, ActiveRecord::Encryption.cipher.iv_length]
end
```

- Non-deterministic: `cipher.random_iv` — a fresh CSPRNG 12-byte IV per write.
- Deterministic: the first 12 bytes of `HMAC-SHA256(key, plaintext)`.

The guide states this precisely (`active_record_encryption.md` v8.1.3, §"Querying Encrypted
Data: Deterministic vs. Non-deterministic Encryption"): *"In non-deterministic mode, Active
Record uses AES-GCM with a 256-bits key and a random initialization vector. In deterministic
mode, it also uses AES-GCM, but the initialization vector is not random. It is generated as a
function of the key and the plaintext content (HMAC-SHA-256 digest of the two)."* Here the
guide and the source agree exactly.

Secondary differences, none of which touch the envelope layout:

- Different key: deterministic uses `config.deterministic_key`, non-deterministic uses
  `config.primary_key` (`AR_ENC/scheme.rb:96-104`). See 2.4.
- Deterministic forces the plaintext encoding to UTF-8 before encrypting
  (`AR_ENC/encryptor.rb`, `#force_encoding_if_needed`, line 178, gated on
  `cipher_options[:deterministic]`), so the `e` header effectively never appears there.
- Deterministic may `downcase` if `ignore_case: true` (`AR_ENC/scheme.rb:40`).

### Does the difference matter for a Node reader? **No, for reading. Yes, and in our favour, for writing.**

- **Reading:** identical. The reader takes the IV from `h.iv` regardless of how it was produced.
  A single decrypt path handles both modes.
- **Writing:** non-deterministic is *strictly easier*. Deterministic mode requires
  byte-for-byte-identical output for the same plaintext, because Rails does encrypted-value
  equality lookups in SQL (`AR_ENC/encryptor.rb:100-108` explains why the compression threshold
  is frozen; `AR_ENC/extended_deterministic_queries.rb` implements the lookups). That means a
  deterministic writer would have to match Rails' JSON key ordering, base64 flavour, and
  compression decision *exactly* or silently break queries. **None of that applies here.**
  Because `S3Credential` is non-deterministic, Node's output only needs to be *parseable and
  decryptable* by Rails, not identical to what Rails would have written. That materially lowers
  the risk of a write-side implementation.

---

## 4. Does any published Node/TypeScript library read this format?

### 4.1 Search results: **no**

npm registry full-text search (`https://registry.npmjs.org/-/v1/search`) for
`activerecord encryption`, `rails encryption`, `active-record-encryption`, `rails encrypts`,
`activerecord-encryptor`, `rails encrypted attributes`, `activerecord decrypt`,
`rails gcm pbkdf2 decrypt` — every hit was either an unrelated `@rails/*` frontend package, a
generic AES helper (`cryptr`, `simple-encryptor`, `@47ng/cloak`), or an AWS Encryption SDK
module. Direct `GET https://registry.npmjs.org/<name>` for the obvious names
(`activerecord-encryption`, `active-record-encryption`, `rails-encryption`,
`rails-active-record-encryption`, `ar-encryption`, `activerecord-encryptor`,
`rails-attr-encrypted`, `node-rails-encryption`) returned **404 for all eight**.

Adjacent-but-not-this: `node-laravel-encryptor` (a Node port of Laravel's `Encrypter.php`)
exists, and a Python port of AR encryption exists (`github.com/ghn/rails_ar_encryption`). Both
show the pattern is viable cross-language; neither is a Node reader for AR's format. There is
also `rails-session-decoder` for Rails 4 sessions — a different, unrelated envelope
(`ActiveSupport::MessageEncryptor`).

**Conclusion: you would be writing this yourself.**

### 4.2 How much Node code? I wrote it, and it works both ways

Working reader **and** writer, complete, in ~26 lines of logic:

```js
import crypto from "node:crypto"; import zlib from "node:zlib";
const KEY = crypto.pbkdf2Sync(PRIMARY_KEY, KEY_DERIVATION_SALT, 2**16, 32, "sha256");
const THRESHOLD = 140;

export function decrypt(s) {
  const m = JSON.parse(s); const h = m.h ?? {};
  const ct = Buffer.from(m.p, "base64"),
        iv = Buffer.from(h.iv, "base64"),
        tag = Buffer.from(h.at, "base64");
  if (tag.length !== 16) throw new Error("bad auth tag");
  const d = crypto.createDecipheriv("aes-256-gcm", KEY, iv); d.setAuthTag(tag);
  let out = Buffer.concat([d.update(ct), d.final()]);
  if (h.c) out = zlib.inflateSync(out);
  return out.toString("utf8");            // + encoding map if h.e is present
}

export function encrypt(plain) {
  let buf = Buffer.from(plain, "utf8"); const headers = {}; let compressed = false;
  const iv = crypto.randomBytes(12);
  if (buf.length > THRESHOLD) { buf = zlib.deflateSync(buf); compressed = true; }
  const c = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const ct = Buffer.concat([c.update(buf), c.final()]);
  headers.iv = iv.toString("base64"); headers.at = c.getAuthTag().toString("base64");
  if (compressed) headers.c = true;
  return JSON.stringify({ p: ct.toString("base64"), h: headers });
}
```

**Verified interop transcript** (Node v24.15.0 ↔ activerecord 8.1.3, matching dummy keys, no
database — `Encryptor#encrypt`/`#decrypt` called directly):

```
NODE DECRYPTED RUBY OUTPUT: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"   # short, uncompressed
NODE DECRYPTED RUBY OUTPUT: "LLLL…"                                      # 300 bytes, h.c == true
RUBY DECRYPTED NODE OUTPUT: "written-by-node-AKIAIOSFODNN7EXAMPLE"       # Node-written, short
RUBY DECRYPTED NODE OUTPUT: "ZZZZ…"                                      # Node-written, 400 bytes, deflated
```

The Ruby-side envelope for the 300-byte value, showing `c` as a JSON boolean:

```json
{"p":"Qkgn4XznrTFLvfHC4w==","h":{"iv":"fGQXZQVbCBxXEgnO","at":"cQGe23guJe4JDMli0ZoW6w==","c":true}}
```

### 4.3 Honest production line-count estimate

The 26-line version above is a real, working implementation for this app's exact
configuration. A **production-grade** module adds: strict base64 validation
(Ruby uses `strict_decode64`, which *rejects* malformed input; `Buffer.from(x, "base64")` is
lenient and silently truncates), a Ruby-encoding-name → Node-encoding map for `h.e`, explicit
rejection of `h.k`/`h.i`, multi-key rotation support (try each derived key in order), typed
errors mirroring `Errors::Decryption` / `Errors::Encoding`, and a config object rather than
module-level constants.

**Estimate: 150–250 lines of TypeScript, plus a test suite.** The test suite matters more than
the module: it must include golden vectors produced by the *actual Rails app* (not
hand-written), and ideally a CI check that re-derives them, so a Rails upgrade that changes
derivation fails loudly instead of silently.

**`node:crypto` / `node:zlib` primitives needed** — all built-in, zero dependencies:

- `crypto.pbkdf2Sync(password, salt, 65536, 32, "sha256")`
- `crypto.createDecipheriv("aes-256-gcm", key, iv)` + `.setAuthTag(tag)`
- `crypto.createCipheriv("aes-256-gcm", key, iv)` + `.getAuthTag()`
- `crypto.randomBytes(12)`
- `zlib.inflateSync` / `zlib.deflateSync` (RFC 1950, matches Ruby `Zlib`)
- `Buffer` base64 encode/decode
- (`crypto.createHmac("sha256", key)` only if you ever need deterministic mode)

---

## 5. Is decrypting outside Rails documented or sanctioned?

**No. The format is described but never specified, and the parameters you actually need are
absent from every official document.**

### 5.1 What the docs do and don't say

The guide *does* describe the envelope shape — `active_record_encryption.md` v8.1.3,
§"Declare Encrypted Attributes": *"The value inserted is a JSON object that contains the
encrypted value… the JSON object stores two keys: `p` for payload and `h` for headers… The `iv`
value is the initialization vector and `at` is authentication tag."* And it names the cipher and
the IV strategy (§"Querying Encrypted Data…", quoted in Q3).

But the guide says only that `DerivedSecretKeyProvider` *"serves keys derived from the provided
passwords using PBKDF2"* (§"Built-in Key Providers → DerivedSecretKeyProvider"). **It never
states the iteration count, the digest, or the output length.** I grepped the full v8.1.3 guide
source for `pbkdf2`, `iterations`, `sha1`, `digest`, `65536` — the only hit for any of them is
that one word "PBKDF2". The `configuring.md` guide documents `hash_digest_class` as a *setting*
with per-`load_defaults` defaults, but never in the context of "here is how to reproduce a key
outside Rails."

There is **no** "decrypting outside Rails" section, no format version number in the envelope, no
spec document, and no statement in the guide either sanctioning or forbidding an external
reader. The absence of any commitment is the answer: it's an implementation detail that happens
to be readable.

Two corroborating signals from inside the source:

- The `Encryptor#encrypt` doc comment (`AR_ENC/encryptor.rb:36-41`) is **factually wrong** about
  the serializer (`SafeMarshal`, a class that doesn't exist in the gem) and about an outer Base64
  step that doesn't happen. Nobody has maintained that prose as a contract.
- The one place Rails *does* commit to format stability is
  `THRESHOLD_TO_JUSTIFY_COMPRESSION` (`AR_ENC/encryptor.rb:98`): *"This threshold cannot be
  changed."* — and the reason given is purely internal (deterministic SQL lookups would break),
  not external interoperability.

### 5.2 Empirical stability across versions

I diffed the 7.0.4.3 gem (also present on this machine, at
`/usr/share/rvm/gems/ruby-3.1.4/gems/activerecord-7.0.4.3/lib/active_record/encryption/`)
against 8.1.3:

**Unchanged (good news):**

- `message_serializer.rb` — identical JSON `{p, h}` shape and `strict_encode64` logic. The only
  diff is a `require "base64"` and the new `#binary?` method.
- `cipher/aes256_gcm.rb` — the encrypt/decrypt/IV logic is byte-identical; the only diff is an
  added `#inspect`.
- `properties.rb` — `DEFAULT_PROPERTIES` (`k`, `i`, `c`, `iv`, `at`, `e`) unchanged.

**So the wire format has been stable from Rails 7.0 through 8.1.** A parser written today would
have read Rails 7.0 data too.

**Changed (the actual risk):**

- `key_generator.rb` gained the `hash_digest_class:` constructor parameter; 7.0 called
  `ActiveSupport::KeyGenerator.new(password)` with no digest option.
- `config.rb` gained `hash_digest_class` (defaulting to SHA-1) and
  `support_sha1_for_non_deterministic_encryption=`, and `compressor`.
- `railties` `load_defaults "7.1"` flipped the effective digest to SHA-256.

That is a **real, shipped, silent change to key derivation** — the same ciphertext parser,
a different key. Rails handled it for Ruby consumers with the
`support_sha1_for_non_deterministic_encryption` compatibility scheme; a Node reimplementation
would simply have started failing to decrypt, with an authentication-tag error indistinguishable
from data corruption. That is the precedent that should drive the ticket-03 decision.

A second latent hazard: `MessagePackMessageSerializer` exists and is fully implemented
(`AR_ENC/message_pack_message_serializer.rb`, `#binary?` → `true`). It is not the default in
8.1, but it is one config line away, and switching it changes the on-disk representation to
binary MessagePack for all *new* writes while leaving old JSON rows in place. A Node reader
pinned to JSON would break on a config change made for unrelated reasons.

### 5.3 Verdict on maintenance liability

Reading AR's format from Node is **not** reverse engineering — the algorithm is short,
readable, and stable in its wire shape. But it is an **unversioned, undocumented-in-the-
parameters-that-matter contract** with a framework you are in the process of leaving. If the
Rails app is being retired, the coupling is temporary and acceptable. If the two will coexist
long-term, migrating to a neutral scheme (or to a KMS/secrets manager) removes a class of
failure that is silent, cryptographic, and — for exactly two columns of AWS credentials — not
worth carrying.

---

## Sources

### Rails source on disk (primary; the gemset this project actually resolves)

Base: `/usr/share/rvm/gems/ruby-3.4.9@gallery/gems/activerecord-8.1.3/lib/active_record/encryption/`

- `cipher.rb` — `Cipher#encrypt` (encoding header), `#decrypt`, `#try_to_decrypt_with_each`, `#key_length`, `#iv_length`
- `cipher/aes256_gcm.rb` — `Aes256Gcm::CIPHER_TYPE`, `.key_length`, `.iv_length`, `#encrypt`, `#decrypt`, `#generate_iv`, `#generate_deterministic_iv`
- `message.rb` — `Message` (payload + headers)
- `message_serializer.rb` — `MessageSerializer#dump`, `#load`, `#message_to_json`, `#encode_if_needed`, `#decode_if_needed`, `#validate_message_data_format`, `#binary?`
- `message_pack_message_serializer.rb` — `MessagePackMessageSerializer#binary?` (the non-default alternative)
- `encryptor.rb` — `Encryptor#encrypt`, `#decrypt`, `#build_encrypted_message`, `#compress_if_worth_it`, `THRESHOLD_TO_JUSTIFY_COMPRESSION`, `#force_encoding_if_needed`; also the **stale/incorrect** `#encrypt` doc comment
- `properties.rb` — `Properties::DEFAULT_PROPERTIES` (the `p`/`h` short keys)
- `key.rb` — `Key#secret`, `Key#id`
- `key_generator.rb` — `KeyGenerator#derive_key_from`, `#key_derivation_salt`, `#key_length`
- `key_provider.rb` — `KeyProvider#encryption_key`, `#decryption_keys` (rotation)
- `derived_secret_key_provider.rb` — `DerivedSecretKeyProvider#derive_key_from`
- `deterministic_key_provider.rb` — `DeterministicKeyProvider` (rotation forbidden)
- `envelope_encryption_key_provider.rb` — `EnvelopeEncryptionKeyProvider` (source of the `k`/`i` headers; not used here)
- `scheme.rb` — `Scheme#key_provider`, `#deterministic_key_provider`, `#default_key_provider`, `#deterministic?`
- `config.rb` — `Config#set_defaults` (`hash_digest_class`, `compressor`, `store_key_references`), `Config#support_sha1_for_non_deterministic_encryption=`
- `configurable.rb` — `Configurable::ClassMethods#configure` (`reset_default_context` ordering)
- `context.rb` — `Context#set_defaults`, `#build_default_key_provider`
- `encrypted_attribute_type.rb` — `EncryptedAttributeType#serialize`, `#deserialize`, `#encryption_options`, `#text_to_database_type`
- `encryptable_record.rb` — `#validate_column_size`

Other gems:

- `/usr/share/rvm/gems/ruby-3.4.9@gallery/gems/activesupport-8.1.3/lib/active_support/key_generator.rb` — `ActiveSupport::KeyGenerator#initialize` (`2**16` iterations), `#generate_key` (`OpenSSL::PKCS5.pbkdf2_hmac`)
- `/usr/share/rvm/gems/ruby-3.4.9@gallery/gems/railties-8.1.3/lib/rails/application/configuration.rb:288-289` — `load_defaults "7.1"` sets `hash_digest_class = SHA256`, `support_sha1_for_non_deterministic_encryption = false`
- `/usr/share/rvm/gems/ruby-3.4.9@gallery/gems/activerecord-8.1.3/lib/active_record/railtie.rb:361-368` — `active_record_encryption.configuration` initializer
- `/usr/share/rvm/gems/ruby-3.4.9@gallery/gems/activerecord-8.1.3/lib/active_record/railties/databases.rake:521-533` — `db:encryption:init` (three 32-char `SecureRandom.alphanumeric` keys)
- `/usr/share/rvm/gems/ruby-3.1.4/gems/activerecord-7.0.4.3/lib/active_record/encryption/` — the 7.0 comparison used for the cross-version stability diff

### Official documentation

- Active Record Encryption guide (v8.1.3 source):
  https://github.com/rails/rails/blob/v8.1.3/guides/source/active_record_encryption.md —
  §"Generate Encryption Key", §"Declare Encrypted Attributes", §"Important: Storage Considerations",
  §"Querying Encrypted Data: Deterministic vs. Non-deterministic Encryption",
  §"Compression", §"Key Management → Built-in Key Providers → DerivedSecretKeyProvider"
- Rendered guide: https://guides.rubyonrails.org/active_record_encryption.html
- Configuring Rails Applications (v8.1.3 source):
  https://github.com/rails/rails/blob/v8.1.3/guides/source/configuring.md —
  §`config.active_record.encryption.hash_digest_class`,
  §`config.active_record.encryption.support_sha1_for_non_deterministic_encryption`,
  §`config.active_record.encryption.compressor`
- API docs: https://api.rubyonrails.org/classes/ActiveRecord/Encryption/Encryptor.html,
  https://api.rubyonrails.org/classes/ActiveRecord/Encryption/DerivedSecretKeyProvider.html

### npm / ecosystem search (negative result)

- npm registry search API, queries: `activerecord encryption`, `rails encryption`,
  `active-record-encryption`, `rails encrypts`, `activerecord-encryptor`,
  `rails encrypted attributes`, `activerecord decrypt`, `rails gcm pbkdf2 decrypt` — no match
- Direct registry lookups returning 404: `activerecord-encryption`, `active-record-encryption`,
  `rails-encryption`, `rails-active-record-encryption`, `ar-encryption`,
  `activerecord-encryptor`, `rails-attr-encrypted`, `node-rails-encryption`
- Adjacent prior art (not Node, not this format): https://github.com/ghn/rails_ar_encryption (Python),
  https://www.npmjs.com/package/node-laravel-encryptor (different framework)

### Locally executed verification

Standalone Ruby scripts against the gemset (`ActiveRecord::Encryption::Encryptor` used
directly, **no database, no migrations, no test suite**) with throwaway dummy keys, plus a Node
v24.15.0 ES module. Established: the exact stored bytes and their lengths; that `h.c` is a JSON
boolean and `h.e` a base64 string; that repeated encryption of the same value yields different
envelopes; that a manual `PBKDF2-HMAC-SHA256(pk, salt, 65536, 32)` key decrypts the payload;
that SHA-1-derived keys fail against SHA-256 configuration; and full **bidirectional** Ruby↔Node
round-trips for both compressed and uncompressed payloads.

### Project files confirming the configuration

- `/home/fernando/Documents/gallery/gallery-api/app/models/s3_credential.rb` — `encrypts :access_key_id`, `encrypts :secret_access_key`, no `deterministic:`
- `/home/fernando/Documents/gallery/gallery-api/db/schema.rb:55-64` — both columns `t.text`
- `/home/fernando/Documents/gallery/gallery-api/config/application.rb:12,21-23` — `load_defaults 8.1`, ENV-sourced keys
- `/home/fernando/Documents/gallery/gallery-api/Gemfile.lock` — `activerecord (8.1.3)`
