import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import MockAdapter from 'axios-mock-adapter';
import apiClient from '@/lib/api/client';
import { PhotosLoadError } from '@/features/images/components/PhotosLoadError';

const mock = new MockAdapter(apiClient);

async function rejectionFrom(request: () => Promise<unknown>): Promise<unknown> {
  try {
    await request();
  } catch (err) {
    return err;
  }
  throw new Error('expected the request to reject');
}

function renderWith(error: unknown) {
  return render(
    <MemoryRouter>
      <PhotosLoadError error={error} fallback="Failed to load images." className="text-danger" testId="images-error" />
    </MemoryRouter>
  );
}

describe('PhotosLoadError', () => {
  beforeEach(() => mock.reset());
  afterAll(() => mock.restore());

  it('names the missing credentials and links to Settings on a 422', async () => {
    mock.onGet('/images').reply(422, { errors: 'No S3 credentials on file' });
    renderWith(await rejectionFrom(() => apiClient.get('/images')));

    expect(screen.getByTestId('images-error')).toHaveTextContent('Your photos need S3 credentials.');
    expect(screen.getByRole('link', { name: 'Add them in Settings' })).toHaveAttribute('href', '/settings/s3_credential');
    expect(screen.queryByText('Failed to load images.')).not.toBeInTheDocument();
  });

  it("shows the page's own sentence for a 500", async () => {
    mock.onGet('/images').reply(500);
    renderWith(await rejectionFrom(() => apiClient.get('/images')));

    expect(screen.getByTestId('images-error')).toHaveTextContent('Failed to load images.');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it("shows the page's own sentence for an error that is not from axios", () => {
    renderWith(new Error('boom'));

    expect(screen.getByTestId('images-error')).toHaveTextContent('Failed to load images.');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
