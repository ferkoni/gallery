import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { createUser, truncateAll } from "./support/db.js";
import { createTestApp } from "./support/app.js";

describe('POST /api/v1/users/login', ()=> {
  let app: NestFastifyApplication;
  let prisma: PrismaService;

  beforeAll(async ()=> {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });
  afterAll(() => app.close());

  beforeEach(() => truncateAll(prisma));

  it('refuses a wrong password', async () => {
    await createUser(prisma, { email: 'email@example.com', password: 'correct-password-12345'} );

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/users/login',
      payload: { user: { email: 'email@example.com', password: 'wrong-password' } }
    });

    expect(response.statusCode).toBe(401);
    expect(response.body).toBe('{"errors":["Invalid email or password"]}');
  })
})