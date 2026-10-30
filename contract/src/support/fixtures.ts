// Every seeded row has a pinned primary key and a pinned timestamp. Ids are
// deterministic because the data tables are truncated with RESTART IDENTITY
// before each test file; timestamps are set explicitly rather than left to
// now(), so ordering assertions (images index is created_at DESC) are stable.

export const PASSWORD = "contract-password-1";

// bcrypt of PASSWORD, seeded as every user's encrypted_password. Devise has no
// pepper here, so this is plain bcrypt, and both backends verify it whatever its
// cost. Produced once, from gallery-api, with:
//
//   bundle exec ruby -rbcrypt -e 'puts BCrypt::Password.create("contract-password-1", cost: 12)'
//
// Regenerate it if PASSWORD changes.
export const PASSWORD_DIGEST = "$2a$12$AmkgFHkaWPZomEbP71zB9.Ofk1NxbPPnJMCBg6KgqIMdWi6VK52G6";

// Users are inserted once per run, with these ids, by global setup. There is no
// signup endpoint to create them through (accounts come from a CLI), and the
// suite must not know which backend's CLI. They are deliberately NOT truncated
// between files: re-seeding would rotate nothing, but the tokens minted for them
// would have to be minted again, and logins are rate limited (see support/auth.ts).
//
// jti is NOT NULL and unique. Login rotates it, so these values only matter until
// global setup logs in.
export const users = {
  owner: { id: 1, email: "owner@contract.test", jti: "00000000-0000-4000-8000-000000000001" },
  stranger: { id: 2, email: "stranger@contract.test", jti: "00000000-0000-4000-8000-000000000002" },
  nocreds: { id: 3, email: "nocreds@contract.test", jti: "00000000-0000-4000-8000-000000000003" },
  authfixture: { id: 4, email: "authfixture@contract.test", jti: "00000000-0000-4000-8000-000000000004" },
} as const;

export type UserKey = keyof typeof users;

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

// Owner's folder tree. Parents come before children, because the parent_id
// foreign key is checked on insert.
//
//   1 Alpha Album          images 1, 2, 5
//   └─ 4 Gamma Album       no images of its own
//      └─ 5 Delta Album    image 4
//   2 Beta Album           no images anywhere below it
//   └─ 6 Beta Child Album
//   7 Epsilon Album        same created_at as 2, so id DESC breaks the tie
//
// Stranger: 3 Stranger Album, image 3. nocreds: 8 No Credentials Album, image 6.
export const albums = [
  {
    id: 1,
    userId: users.owner.id,
    parentId: null,
    name: "Alpha Album",
    description: "The album that has images",
    createdAt: "2026-01-01T10:00:00Z",
  },
  {
    id: 2,
    userId: users.owner.id,
    parentId: null,
    name: "Beta Album",
    description: null,
    createdAt: "2026-01-02T10:00:00Z",
  },
  {
    id: 3,
    userId: users.stranger.id,
    parentId: null,
    name: "Stranger Album",
    description: "Belongs to another user",
    createdAt: "2026-01-03T10:00:00Z",
  },
  {
    id: 4,
    userId: users.owner.id,
    parentId: 1,
    name: "Gamma Album",
    description: "A folder whose only images are in its subfolder",
    createdAt: "2026-01-04T10:00:00Z",
  },
  {
    id: 5,
    userId: users.owner.id,
    parentId: 4,
    name: "Delta Album",
    description: null,
    createdAt: "2026-01-05T10:00:00Z",
  },
  {
    id: 6,
    userId: users.owner.id,
    parentId: 2,
    name: "Beta Child Album",
    description: null,
    createdAt: "2026-01-06T10:00:00Z",
  },
  {
    id: 7,
    userId: users.owner.id,
    parentId: null,
    name: "Epsilon Album",
    description: null,
    createdAt: "2026-01-02T10:00:00Z",
  },
  // nocreds' own folder. Uploading needs a folder the uploader owns: the
  // ownership guard runs before the credentials check, so uploading into
  // someone else's folder answers 404 and never reaches the 422 under test.
  {
    id: 8,
    userId: users.nocreds.id,
    parentId: null,
    name: "No Credentials Album",
    description: null,
    createdAt: "2026-01-08T10:00:00Z",
  },
] as const;

// Images 1-3 use the legacy albums/<id>/<uuid>/ key and have no thumbnail. No
// install has such rows (map constraint 9), but the Rails code still serves
// them and the port must too. Images 4 and 5 use the current images/<uuid>/
// key (#50) with a thumbnail beside it (<name>.thumb.webp).
//
// Image 5 has image 2's created_at, so the index's id DESC tiebreaker shows,
// and both titles contain "Harbour", so ?q=harbour returns two rows whose
// order is asserted. Rails ranks lexical results newest first (5, 2), not by
// id as Images::Search intends: a frozen quirk, bugs.md 14.
export const images = [
  {
    id: 1,
    userId: users.owner.id,
    albumId: 1,
    title: "Sunrise Over Water",
    description: "First seeded image",
    s3Key: "albums/1/11111111-1111-4111-8111-111111111111/sunrise.jpg",
    thumbKey: null,
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
    thumbKey: null,
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
    thumbKey: null,
    tags: [],
    favorited: false,
    createdAt: "2026-02-03T09:00:00Z",
  },
  {
    id: 4,
    userId: users.owner.id,
    albumId: 5,
    title: "Lighthouse Beam",
    description: "Two folders below the top level",
    s3Key: "images/44444444-4444-4444-8444-444444444444/lighthouse.jpg",
    thumbKey: "images/44444444-4444-4444-8444-444444444444/lighthouse.thumb.webp",
    tags: [],
    favorited: false,
    createdAt: "2026-02-04T09:00:00Z",
  },
  {
    id: 5,
    userId: users.owner.id,
    albumId: 1,
    title: "Harbour Lights",
    description: null,
    s3Key: "images/55555555-5555-4555-8555-555555555555/harbour-lights.webp",
    thumbKey: "images/55555555-5555-4555-8555-555555555555/harbour-lights.thumb.webp",
    tags: [],
    favorited: true,
    createdAt: "2026-02-02T09:00:00Z",
  },
  // nocreds' own image, so show and update reach the credentials check: on
  // someone else's image, authorisation answers 403 first.
  {
    id: 6,
    userId: users.nocreds.id,
    albumId: 8,
    title: "Unsigned",
    description: null,
    s3Key: "images/66666666-6666-4666-8666-666666666666/unsigned.jpg",
    thumbKey: "images/66666666-6666-4666-8666-666666666666/unsigned.thumb.webp",
    tags: [],
    favorited: false,
    createdAt: "2026-02-06T09:00:00Z",
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
