# Auth port: does Node serve login, and when do the auth paths move?

Type: grilling
Status: open
Blocked by: 04

## Question

Decide how authentication crosses the migration boundary.

### What the code already establishes

- `config.pepper` is commented out in `gallery-api/config/initializers/devise.rb` and
  `stretches = 12`, so `users.encrypted_password` holds **plain bcrypt**. Node's `bcrypt`
  can verify existing passwords with no reset and no dual-hash window.
- `jwt.expiration_time = 1.day`, signed HS256 with `secret_key_base`. If Node signs with
  the same secret, tokens interoperate in both directions.
- The payload shape is confirmed by `ApplicationCable::Connection#find_verified_user`,
  which decodes manually and reads `sub` and `jti`.
- Revocation is `JTIMatcher`: `users.jti` must equal the token's `jti`. `UsersController`
  rotates it on **both** login and logout, so logging in anywhere invalidates every other
  session. That is deliberate and parity must preserve it.
- `Warden::JWTAuth::UserEncoder` is called directly — a private gem API, flagged as debt in
  `unbuilt-work.md` §3. Node has no equivalent constraint, so this is where that debt dies.

### To decide

1. Do the auth endpoints move early (auth is self-contained and portable, so it is a
   natural second step) or last (it is the one thing whose breakage locks you out of the
   whole app)?
2. During coexistence, a token minted by Rails will be sent to Node and vice versa. Confirm
   both directions are required, and what happens on JTI rotation while requests are in
   flight against the other backend.
3. Which library signs and verifies in Node — `jose` or `jsonwebtoken` — and whether the
   `iat`/`exp`/`sub` claim set is reproduced exactly, since the frontend does not inspect
   the token but the contract snapshots will capture its shape.
4. Whether rack-attack's login throttle is reproduced now, deferred, or dropped. It is
   currently listed under *Not yet specified* on the map; this ticket may sharpen it into
   its own.

## Answer
