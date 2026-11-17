import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { createUser, truncateAll } from "./support/db.js";
import { createTestApp } from "./support/app.js";

const EMAIL = 'email@example.com';
const PASSWORD = 'correct-password-12345';
const INVALID_CREDENTIALS = '{"errors":["Invalid email or password"]}';

describe('POST /api/v1/users/login', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });
  afterAll(() => app.close());

  beforeEach(() => truncateAll(prisma));

  it('refuses an empty request', async () => {
    await createUser(prisma, {email: EMAIL, password: PASSWORD});

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/users/login',
      payload: {}
    });

    expect(response.statusCode).toBe(401);
    expect(response.body).toBe(INVALID_CREDENTIALS);
  });

  it('refuses a wrong password', async () => {
    await createUser(prisma, {email: EMAIL, password: PASSWORD});

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/users/login',
      payload: {user: {email: EMAIL, password: 'wrong-password'}}
    });

    expect(response.statusCode).toBe(401);
    expect(response.body).toBe(INVALID_CREDENTIALS);
  });

  it('refuses an unknown email', async () => {
    await createUser(prisma, {email: EMAIL, password: PASSWORD});

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/users/login',
      payload: {user: {email: 'unknown@example.com', password: PASSWORD}}
    });

    expect(response.statusCode).toBe(401);
    expect(response.body).toBe(INVALID_CREDENTIALS);
  });

  it('refuses a flat body without the user key', async () => {
    await createUser(prisma, {email: EMAIL, password: PASSWORD});

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/users/login',
      payload: {email: EMAIL, password: PASSWORD}
    });

    expect(response.statusCode).toBe(401);
    expect(response.body).toBe(INVALID_CREDENTIALS);
  });

  it('refuses a user that is not an object', async () => {
    await createUser(prisma, {email: EMAIL, password: PASSWORD});

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/users/login',
      payload: {user: 'abc'}
    });

    expect(response.statusCode).toBe(401);
    expect(response.body).toBe(INVALID_CREDENTIALS);
  });

  it('refuses a non-string email', async () => {
    await createUser(prisma, {email: EMAIL, password: PASSWORD});

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/users/login',
      payload: {user: {email: 1234, password: PASSWORD}}
    });

    expect(response.statusCode).toBe(401);
    expect(response.body).toBe(INVALID_CREDENTIALS);
  });

  it('refuses a non-string password', async () => {
    await createUser(prisma, {email: EMAIL, password: PASSWORD});

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/users/login',
      payload: {user: {email: EMAIL, password: 12345}}
    });

    expect(response.statusCode).toBe(401);
    expect(response.body).toBe(INVALID_CREDENTIALS);
  });

  it('refuses a form-encoded request with the right email and password', async () => {
    await createUser(prisma, {email: EMAIL, password: PASSWORD});

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/users/login',
      headers: {'content-type': 'application/x-www-form-urlencoded'},
      payload: new URLSearchParams({
        'user[email]': EMAIL,
        'user[password]': PASSWORD,
      }).toString(),
    });

    expect(response.statusCode).toBe(401);
    expect(response.body).toBe(INVALID_CREDENTIALS);
  });

  it('accepts the right email and password', async () => {
    await createUser(prisma, {email: EMAIL, password: PASSWORD});

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/users/login',
      payload: {user: {email: EMAIL, password: PASSWORD}}
    });

    expect(response.statusCode).toBe(200);
  });

  it('accepts correct email with spaces', async () => {
    await createUser(prisma, {email: EMAIL, password: PASSWORD});

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/users/login',
      payload: {user: {email: `  ${EMAIL} `, password: PASSWORD}}
    });

    expect(response.statusCode).toBe(200);
  });

  it('accepts correct email with capitals', async () => {
    await createUser(prisma, {email: EMAIL, password: PASSWORD});

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/users/login',
      payload: {user: {email: 'EmaIl@ExaMple.com', password: PASSWORD}}
    });

    expect(response.statusCode).toBe(200);
  });
});
