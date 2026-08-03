# What is ActiveRecord Encryption's on-disk format, and can Node read it?

Type: research
Status: open
Blocked by: —

## Question

`S3Credential` declares `encrypts :access_key_id` and `encrypts :secret_access_key`
(`gallery-api/app/models/s3_credential.rb`), with no `deterministic: true`. Both columns
are `text` in the schema and hold an ActiveRecord Encryption payload, not raw ciphertext.

Establish the facts a Node reader would need:

1. What exactly does Rails 8.1 write into an `encrypts` column? The envelope structure,
   how headers/metadata are encoded, the cipher and mode, the IV and auth-tag placement.
2. How is the data key derived from `ACTIVE_RECORD_ENCRYPTION_PRIMARY_KEY` and
   `..._KEY_DERIVATION_SALT`? Which KDF and parameters?
3. What does non-deterministic mode change versus deterministic, and does it matter here?
4. Does any published Node/TypeScript library read this format? If not, how much code
   would a faithful reader be?
5. Is there a documented or officially sanctioned way to decrypt outside Rails at all, or
   is the format explicitly an internal detail?

Answer with citations to Rails source or official docs, not blog inference. The point is
to establish whether reading the format from Node is a real option or whether ticket 03
must migrate the data instead.

## Answer
