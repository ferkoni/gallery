import { randomUUID } from "node:crypto";
import bcrypt from 'bcrypt';
import type { PrismaService } from "../../src/prisma/prisma.service.js";

// Empties every table in Rails' primary schema that tests write to, and resets the id sequences.
// Checks the database it is connected to first, whatever DATABASE_URL said.
export async function truncateAll(prisma: PrismaService): Promise<void> {
  const [row] = await prisma.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
  if (!row?.name.endsWith('_test')) {
    throw new Error(`Refusing to truncate ${row?.name ?? 'an unknown database'}: not a _test database.`);
  }
  await prisma.$executeRaw`
    TRUNCATE users, albums, images, image_embeddings, async_tasks, s3_credentials
    RESTART IDENTITY CASCADE`;
}

// A user as Devise would store one. Cost 4, bcrypt's minimum, keeps tests fast; compare reads the
// cost from the hash, so login code that verifies these also verifies production's cost 12.
export async function createUser(prisma: PrismaService, { email, password }: { email: string, password: string }) {
  const now = new Date();
  return prisma.user.create({
    data: {
      email,
      encrypted_password: await bcrypt.hash(password, 4),
      jti: randomUUID(),
      created_at: now,
      updated_at: now
    }
  })
}