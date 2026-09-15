import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { MemoryRouter, useParams } from 'react-router-dom';
import App from '@/App';
import { useAuthContext } from '@/features/auth/hooks/useAuthContext';

vi.mock('@/features/auth/hooks/useAuthContext', () => ({ useAuthContext: vi.fn() }));
vi.mock('@/features/downloads/hooks/useUserChannel', () => ({ useUserChannel: vi.fn() }));
vi.mock('@/features/downloads/hooks/useTaskPoller', () => ({ useTaskPoller: vi.fn() }));
vi.mock('@/components/NavBar.tsx', () => ({ NavBar: () => null }));
vi.mock('@/features/images/components/UploadQueue.tsx', () => ({ UploadQueue: () => null }));
vi.mock('@/features/downloads/components/DownloadQueue.tsx', () => ({ DownloadQueue: () => null }));
vi.mock('@/features/pages/WelcomePage.tsx', () => ({ WelcomePage: () => <p>welcome page</p> }));
vi.mock('@/features/pages/LoginPage.tsx', () => ({ LoginPage: () => <p>login page</p> }));
vi.mock('@/features/albums/pages/AlbumListPage.tsx', () => ({ AlbumListPage: () => <p>folder list</p> }));
vi.mock('@/features/albums/pages/AlbumNewPage.tsx', () => ({ AlbumNewPage: () => <p>new folder</p> }));
vi.mock('@/features/images/pages/FavoritesPage.tsx', () => ({ FavoritesPage: () => <p>favorites</p> }));
vi.mock('@/features/images/pages/SearchPage.tsx', () => ({ SearchPage: () => <p>search</p> }));
vi.mock('@/features/settings/pages/S3CredentialsPage.tsx', () => ({ S3CredentialsPage: () => <p>s3 credentials</p> }));
vi.mock('@/features/images/pages/AlbumDetailPage.tsx', () => ({
  AlbumDetailPage: () => {
    const { id } = useParams();
    return <p>folder {id}</p>;
  },
}));

const mockUseAuthContext = useAuthContext as Mock;

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuthContext.mockReturnValue({ token: 'token' });
  });

  it('renders the welcome page at /', () => {
    renderAt('/');
    expect(screen.getByText('welcome page')).toBeInTheDocument();
  });

  it('renders the login page at /login when logged out', () => {
    mockUseAuthContext.mockReturnValue({ token: null });
    renderAt('/login');
    expect(screen.getByText('login page')).toBeInTheDocument();
  });

  it('sends a logged-in visitor from /login to /folders', () => {
    renderAt('/login');
    expect(screen.getByText('folder list')).toBeInTheDocument();
  });

  it.each([
    ['/folders', 'folder list'],
    ['/folders/new', 'new folder'],
    ['/favorites', 'favorites'],
    ['/search', 'search'],
    ['/settings/s3_credential', 's3 credentials'],
  ])('renders %s', (path, text) => {
    renderAt(path);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('renders the folder detail page at /folders/:id', () => {
    renderAt('/folders/12');
    expect(screen.getByText('folder 12')).toBeInTheDocument();
  });

  it.each([
    ['/albums', 'folder list'],
    ['/albums/new', 'new folder'],
    ['/albums/12', 'folder 12'],
  ])('redirects the old %s URL', (path, text) => {
    renderAt(path);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('sends a logged-out visitor following an old /albums link to the login page', () => {
    mockUseAuthContext.mockReturnValue({ token: null });
    renderAt('/albums');
    expect(screen.getByText('login page')).toBeInTheDocument();
  });
});
