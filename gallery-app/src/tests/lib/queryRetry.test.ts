import MockAdapter from 'axios-mock-adapter';
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import apiClient from '@/lib/api/client';
import { retryUnlessClientError } from '@/lib/api/queryRetry';

// Real AxiosErrors from the real client, as errorMessage.test.ts does, so these break if the
// shape axios rejects with ever stops matching what the helper reads.
const mock = new MockAdapter(apiClient);

async function rejectionFrom(request: () => Promise<unknown>): Promise<unknown> {
  try {
    await request();
  } catch (err) {
    return err;
  }
  throw new Error('expected the request to reject');
}

describe('retryUnlessClientError', () => {
  beforeEach(() => mock.reset());
  afterAll(() => mock.restore());

  it.each([422, 404])('never retries a %i', async (status) => {
    mock.onGet('/images').reply(status, { errors: 'No S3 credentials on file' });

    const err = await rejectionFrom(() => apiClient.get('/images'));

    expect(retryUnlessClientError(0, err)).toBe(false);
  });

  it('retries a 500 three times', async () => {
    mock.onGet('/images').reply(500);

    const err = await rejectionFrom(() => apiClient.get('/images'));

    expect([0, 1, 2, 3].map((n) => retryUnlessClientError(n, err))).toEqual([true, true, true, false]);
  });

  it('retries a network failure three times', async () => {
    mock.onGet('/images').networkError();

    const err = await rejectionFrom(() => apiClient.get('/images'));

    expect([0, 1, 2, 3].map((n) => retryUnlessClientError(n, err))).toEqual([true, true, true, false]);
  });

  it('retries anything that is not an axios error three times', () => {
    const err = new Error('boom');

    expect([0, 1, 2, 3].map((n) => retryUnlessClientError(n, err))).toEqual([true, true, true, false]);
  });
});
