import MockAdapter from 'axios-mock-adapter';
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import apiClient from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/errorMessage';

// Real AxiosErrors from the real client, rather than hand-built ones, so these break if
// the shape axios rejects with ever stops matching what the helper reads.
const mock = new MockAdapter(apiClient);

async function rejectionFrom(request: () => Promise<unknown>): Promise<unknown> {
  try {
    await request();
  } catch (err) {
    return err;
  }
  throw new Error('expected the request to reject');
}

const fallback = 'Upload failed. Please try again.';

describe('apiErrorMessage', () => {
  beforeEach(() => mock.reset());
  afterAll(() => mock.restore());

  it("returns the API's sentence from a 422", async () => {
    mock.onPost('/images').reply(422, { errors: 'File is too large. Maximum size is 25 MB' });

    const err = await rejectionFrom(() => apiClient.post('/images'));

    expect(apiErrorMessage(err, fallback)).toBe('File is too large. Maximum size is 25 MB');
  });

  it("never returns axios's own message", async () => {
    mock.onPost('/images').reply(422, { errors: 'File type not allowed. Accepted: JPEG, PNG, WebP, GIF' });

    const err = await rejectionFrom(() => apiClient.post('/images'));

    expect(apiErrorMessage(err, fallback)).not.toContain('status code');
  });

  it('falls back when the response has no body', async () => {
    mock.onPost('/images').reply(500);

    const err = await rejectionFrom(() => apiClient.post('/images'));

    expect(apiErrorMessage(err, fallback)).toBe(fallback);
  });

  it('falls back on a network failure, where there is no response at all', async () => {
    mock.onPost('/images').networkError();

    const err = await rejectionFrom(() => apiClient.post('/images'));

    expect(apiErrorMessage(err, fallback)).toBe(fallback);
  });

  it("falls back for the API's other error shapes rather than printing them", async () => {
    mock.onPost('/albums').reply(422, { errors: { name: ["can't be blank"] } });

    const err = await rejectionFrom(() => apiClient.post('/albums'));

    expect(apiErrorMessage(err, fallback)).toBe(fallback);
  });

  it('falls back for an error that did not come from axios', () => {
    expect(apiErrorMessage(new Error('boom'), fallback)).toBe(fallback);
  });
});
