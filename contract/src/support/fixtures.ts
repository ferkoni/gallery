// Every seeded row has a pinned primary key and a pinned timestamp. Ids are
// deterministic because the data tables are truncated with RESTART IDENTITY
// before each test file; timestamps are set explicitly rather than left to
// now(), so ordering assertions (images index is created_at DESC) are stable.

export const PASSWORD = "contract-password-1";

// Users are seeded once per run, in this order, through POST /api/users — so
// their ids follow registration order. They are deliberately NOT truncated
// between files: re-registering would be free, but re-authenticating would burn
// rack-attack's login budget (see support/auth.ts).
export const users = {
  owner: { id: 1, email: "owner@contract.test" },
  stranger: { id: 2, email: "stranger@contract.test" },
  nocreds: { id: 3, email: "nocreds@contract.test" },
  authfixture: { id: 4, email: "authfixture@contract.test" },
} as const;

export type UserKey = keyof typeof users;

// Registration order. Pinned ids above depend on it.
export const userOrder: UserKey[] = ["owner", "stranger", "nocreds", "authfixture"];

// Seeded straight into Postgres in AR Encryption's envelope format. These are
// syntactically valid but entirely fake — the read endpoints never dereference
// a presigned URL, they only build one, and presigning is local crypto with no
// network call (see the comment on Api::ImagesController#serializer_params).
export const s3Credentials = [
  {
    id: 1,
    userId: users.owner.id,
    region: "eu-west-1",
    bucket: "contract-owner-bucket",
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  },
  {
    id: 2,
    userId: users.stranger.id,
    region: "us-east-1",
    bucket: "contract-stranger-bucket",
    accessKeyId: "AKIAI44QH8DHBEXAMPLE",
    secretAccessKey: "je7MtGbClwBF/2Zp9Utk/h3yCo8nvbEXAMPLEKEY",
  },
] as const;

export const albums = [
  {
    id: 1,
    userId: users.owner.id,
    name: "Alpha Album",
    description: "The album that has images",
    createdAt: "2026-01-01T10:00:00Z",
  },
  {
    id: 2,
    userId: users.owner.id,
    name: "Beta Album",
    description: null,
    createdAt: "2026-01-02T10:00:00Z",
  },
  {
    id: 3,
    userId: users.stranger.id,
    name: "Stranger Album",
    description: "Belongs to another user",
    createdAt: "2026-01-03T10:00:00Z",
  },
] as const;

export const images = [
  {
    id: 1,
    userId: users.owner.id,
    albumId: 1,
    title: "Sunrise Over Water",
    description: "First seeded image",
    s3Key: "albums/1/11111111-1111-4111-8111-111111111111/sunrise.jpg",
    tags: ["landscape", "morning"],
    favorited: true,
    createdAt: "2026-02-01T09:00:00Z",
  },
  {
    id: 2,
    userId: users.owner.id,
    albumId: 1,
    title: "Harbour At Dusk",
    description: null,
    s3Key: "albums/1/22222222-2222-4222-8222-222222222222/harbour.png",
    tags: ["landscape"],
    favorited: false,
    createdAt: "2026-02-02T09:00:00Z",
  },
  {
    id: 3,
    userId: users.stranger.id,
    albumId: 3,
    title: "Not Yours",
    description: null,
    s3Key: "albums/3/33333333-3333-4333-8333-333333333333/private.jpg",
    tags: [],
    favorited: false,
    createdAt: "2026-02-03T09:00:00Z",
  },
] as const;

export const asyncTasks = [
  {
    id: 1,
    userId: users.owner.id,
    taskType: "album_download",
    status: "pending",
    payload: { album_id: 1 },
    result: {},
    expiresAt: null,
    createdAt: "2026-03-01T08:00:00Z",
  },
  {
    id: 2,
    userId: users.owner.id,
    taskType: "album_download",
    status: "completed",
    payload: { album_id: 1 },
    result: { url: "https://contract-owner-bucket.s3.eu-west-1.amazonaws.com/downloads/1/2/album.zip" },
    expiresAt: "2026-03-01T08:15:00Z",
    createdAt: "2026-03-01T08:00:00Z",
  },
  {
    id: 3,
    userId: users.stranger.id,
    taskType: "album_download",
    status: "failed",
    payload: { album_id: 3 },
    result: { error: "Album has no images" },
    expiresAt: null,
    createdAt: "2026-03-02T08:00:00Z",
  },
] as const;
