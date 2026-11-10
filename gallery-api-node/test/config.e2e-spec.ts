import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Node signs and verifies login tokens with Rails' secret_key_base, so it must not start without
// it. @nestjs/config reads the environment when AppModule is imported, so each case sets the
// variable first, then imports a fresh copy.
describe('boot config', () => {
  const original = process.env['SECRET_KEY_BASE'];

  afterEach(() => {
    // Assigning undefined would store the string "undefined".
    if (original === undefined) delete process.env['SECRET_KEY_BASE'];
    else process.env['SECRET_KEY_BASE'] = original;
  });

  async function compileAppModule(): Promise<unknown> {
    vi.resetModules();
    const { AppModule } = await import('../src/app.module.js');
    return Test.createTestingModule({ imports: [AppModule] }).compile();
  }

  it('refuses to start when SECRET_KEY_BASE is not set', async () => {
    delete process.env['SECRET_KEY_BASE'];

    await expect(compileAppModule()).rejects.toThrow(/SECRET_KEY_BASE/);
  });

  it('refuses to start when SECRET_KEY_BASE is empty, as in .env.example', async () => {
    process.env['SECRET_KEY_BASE'] = '';

    await expect(compileAppModule()).rejects.toThrow(/SECRET_KEY_BASE/);
  });
});
