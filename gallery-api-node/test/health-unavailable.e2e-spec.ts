import 'reflect-metadata';
import { type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from "./support/app.js";

// Rails' HealthController#show rescues the database error: 503 with
// {"status":"error","database":<message>}. The message is the driver's own, so only its
// presence is asserted. Its own file, because it points DATABASE_URL at a closed port.
describe('GET /health when the database cannot be reached', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    process.env['DATABASE_URL'] = 'postgres://nobody:nothing@127.0.0.1:1/no_database';
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers 503 with status error and the database error message', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(503);
    const body = response.json<{ status: unknown; database: unknown }>();
    expect(Object.keys(body)).toEqual(['status', 'database']);
    expect(body.status).toBe('error');
    expect(typeof body.database).toBe('string');
    expect(body.database).not.toBe('');
  });
});
