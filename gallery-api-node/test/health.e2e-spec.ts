import 'reflect-metadata';
import { type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from "./support/app.js";

// Rails' HealthController#show: SELECT 1, then {"status":"ok","database":"ok"}.
describe('GET /health', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers 200 with the database ok, in the body Rails sends', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('{"status":"ok","database":"ok"}');
  });
});
