import pg from "pg";
import { databaseUrl } from "./config.js";
import { encrypt } from "./ar-encryption.js";
import { albums, asyncTasks, images, s3Credentials } from "./fixtures.js";

// The one place the suite talks to something other than HTTP. It speaks
// Postgres, not Rails — no ActiveRecord, no rails runner — so it keeps working
// unchanged once Rails is gone.
async function withClient<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

const DATA_TABLES = ["images", "async_tasks", "s3_credentials", "albums"];

// Truncates everything except users. Users survive the whole run because
// re-seeding them would mean re-authenticating, and logins are rate limited.
export async function resetData(): Promise<void> {
  await withClient(async (client) => {
    await client.query(`TRUNCATE ${DATA_TABLES.join(", ")} RESTART IDENTITY CASCADE`);
    await seedS3Credentials(client);
    await seedAlbums(client);
    await seedImages(client);
    await seedAsyncTasks(client);
    await resyncSequences(client);
  });
}

// Truncates users too. Only the global setup calls this.
export async function resetEverything(): Promise<void> {
  await withClient(async (client) => {
    await client.query(`TRUNCATE users, ${DATA_TABLES.join(", ")} RESTART IDENTITY CASCADE`);
  });
}

async function seedS3Credentials(client: pg.Client): Promise<void> {
  for (const credential of s3Credentials) {
    await client.query(
      `INSERT INTO s3_credentials
         (id, user_id, region, bucket, access_key_id, secret_access_key, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now(), now())`,
      [
        credential.id,
        credential.userId,
        credential.region,
        credential.bucket,
        encrypt(credential.accessKeyId),
        encrypt(credential.secretAccessKey),
      ],
    );
  }
}

async function seedAlbums(client: pg.Client): Promise<void> {
  for (const album of albums) {
    await client.query(
      `INSERT INTO albums (id, user_id, name, description, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $5)`,
      [album.id, album.userId, album.name, album.description, album.createdAt],
    );
  }
}

async function seedImages(client: pg.Client): Promise<void> {
  for (const image of images) {
    await client.query(
      `INSERT INTO images
         (id, user_id, album_id, title, description, s3_key, tags, favorited, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)`,
      [
        image.id,
        image.userId,
        image.albumId,
        image.title,
        image.description,
        image.s3Key,
        image.tags,
        image.favorited,
        image.createdAt,
      ],
    );
  }
}

async function seedAsyncTasks(client: pg.Client): Promise<void> {
  for (const task of asyncTasks) {
    await client.query(
      `INSERT INTO async_tasks
         (id, user_id, task_type, status, payload, result, expires_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)`,
      [
        task.id,
        task.userId,
        task.taskType,
        task.status,
        JSON.stringify(task.payload),
        JSON.stringify(task.result),
        task.expiresAt,
        task.createdAt,
      ],
    );
  }
}

// Inserting explicit ids does not advance the identity sequence, so the next
// row the API creates would collide. Push each sequence past the seeded rows.
async function resyncSequences(client: pg.Client): Promise<void> {
  for (const table of DATA_TABLES) {
    await client.query(
      `SELECT setval(pg_get_serial_sequence($1, 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 0) + 1, false)`,
      [table],
    );
  }
}

// Used by the s3_credentials suite to assert that what Rails wrote to the
// encrypted columns is genuinely an AR Encryption envelope and not plaintext —
// the black-box equivalent of spec/models/s3_credential_spec.rb's raw-SQL check.
export async function readRawCredentialColumns(
  userId: number,
): Promise<{ access_key_id: string; secret_access_key: string } | null> {
  return withClient(async (client) => {
    const result = await client.query<{ access_key_id: string; secret_access_key: string }>(
      "SELECT access_key_id, secret_access_key FROM s3_credentials WHERE user_id = $1",
      [userId],
    );
    return result.rows[0] ?? null;
  });
}
