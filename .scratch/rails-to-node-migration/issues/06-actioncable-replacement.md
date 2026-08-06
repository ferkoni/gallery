# What replaces ActionCable, server and client?

Type: grilling
Status: open
Blocked by: —

## Question

The real-time layer is the one part of this migration that is explicitly **full-stack** —
ActionCable's wire protocol is bespoke, and `gallery-app` imports `@rails/actioncable`
(`^8.1.300`) directly, so the server cannot be swapped without the client.

### What exists today

- `UserChannel` streams from `user_<id>`; `AlbumDownloadJob` broadcasts `completed`/`failed`
  payloads to it.
- Auth is a JWT smuggled through the **`Sec-WebSocket-Protocol`** subprotocol header —
  `useUserChannel.ts` monkey-patches `adapters.WebSocket` to inject `token.<jwt>`, and
  `ApplicationCable::Connection#extract_token` parses it back out. This was a deliberate fix
  to keep the token out of URLs and logs; parity must not regress it.
- Pub/sub is Solid Cable, backed by the dedicated `gallery_api_development_cable` database.
  A single Node process holding subscriptions in memory makes that database unnecessary —
  decide whether it is dropped.
- Client consumers: `useUserChannel`, plus `useTaskPoller` as the fallback path, plus
  `downloadStore`. `gallery-app` enforces 100%-per-file coverage, so the swap lands with
  tests or it does not land.

### To decide

1. Server side: `@nestjs/websockets` with a `ws` adapter, plain `ws`, Socket.IO, or SSE.
   SSE deserves real consideration — the traffic is one-directional server-to-client
   notifications, which is exactly what SSE is for, and it removes the upgrade handshake
   and the subprotocol auth hack entirely.
2. Wire format: invent a minimal envelope, or reproduce ActionCable's so the existing client
   keeps working and the frontend change is deferred? The latter contradicts the full-stack
   decision but is worth pricing before discarding.
3. Client side: what replaces `@rails/actioncable`, and does the monkey-patched adapter
   disappear? If SSE, auth becomes a normal header or query and `EventSource` needs a
   polyfill for headers.
4. Does `useTaskPoller` survive as the fallback, or does the new transport make it
   redundant? It was added specifically because a dropped ActionCable push left tasks stuck
   in `pending` forever.
5. When does `/cable` move through the proxy — independently of the REST endpoints, since
   `ws: true` allows it, or coupled to the async-tasks endpoints?

## Answer
