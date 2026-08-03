# In what order do endpoints move through the proxy, and what is done per endpoint?

Type: grilling
Status: open
Blocked by: 01

## Question

Porting is one proxy line at a time. Decide the sequence and the definition of done, so the
handoff after this map has an unambiguous route to walk.

### Groups to sequence

| Group | Notes |
|---|---|
| `/health` | Done in ticket 04 as the skeleton |
| `/api/users/*` | Auth; sequencing decided in ticket 05 |
| `/api/albums` + `/api/albums/:id` | Plain CRUD plus Kaminari `meta`; album destroy touches S3 |
| `/api/albums/:album_id/images` | Nested index; note the album ownership guard returns 404, not 403 |
| `/api/images` index/show | Presigned URL generation in the serializer |
| `/api/images` create/destroy | Multipart upload, S3 writes, rollback-on-DB-failure |
| `/api/images/:id` PATCH | Metadata plus the cross-user `album_id` guard |
| search/filter params | Rides on the images index rather than being its own path |
| favorites | `?favorited=true` on the images index |
| `/api/s3_credentials` | Gated on ticket 03 |
| `/api/async_tasks` + `/cable` | Gated on tickets 06 and 07 |

### To decide

1. The order. Read-only before write? Cheapest before riskiest? Or follow the frontend so
   one screen at a time becomes fully Node-served, which gives better manual-testing signal?
2. Definition of done per endpoint. Candidate bar: contract suite green against Node for
   that path, the proxy line flipped, the frontend exercised manually, and the Rails
   controller left untouched so reverting is one line.
3. Whether a path can sit half-ported — for example images index on Node while images create
   stays on Rails. The proxy matches by prefix, not by method, so **splitting by HTTP verb
   within one path is not possible**. That constrains the grouping and needs confirming.
4. Whether the Rails specs for a ported endpoint get deleted at the time of porting or all
   at cutover.

## Answer
