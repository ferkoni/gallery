import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// Prisma 7 does not load .env itself. Node can, without the dotenv package.
if (existsSync('.env')) process.loadEnvFile('.env');

// No migrations: Rails owns the schema until cutover (rails-to-node constraint 2). Use only
// `prisma db pull` (read-only) and `prisma generate`.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});
