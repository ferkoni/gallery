import { useRef, useState } from 'react';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuthContext } from '@/features/auth/hooks/useAuthContext';
import { useOnClickOutside } from '@/hooks/useOnClickOutside';

export function NavBar() {
  const { token, logout } = useAuthContext();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);

  useOnClickOutside(settingsRef, () => setSettingsOpen(false));

  const searchDefaultValue = location.pathname === '/search' ? (searchParams.get('q') ?? '') : '';

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const value = searchInputRef.current?.value.trim() ?? '';
      if (value) navigate(`/search?q=${encodeURIComponent(value)}`);
    }
  };

  return (
    <nav className="bg-white shadow px-6 py-4 flex items-center justify-between">
      <Link to="/" className="text-xl font-bold text-gray-800">Gallery</Link>

      <div className="flex items-center gap-4">
        {token ? (
          <>
            <input
              key={`${location.pathname}|${searchDefaultValue}`}
              ref={searchInputRef}
              type="text"
              placeholder="Search images…"
              defaultValue={searchDefaultValue}
              onKeyDown={handleSearchKeyDown}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-52 focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            <Link to="/albums" className="text-gray-600 hover:text-gray-900">Albums</Link>
            <Link to="/favorites" className="text-gray-600 hover:text-gray-900">Favorites</Link>

            <div ref={settingsRef} className="relative">
              <button
                data-testid="settings-menu-button"
                onClick={() => setSettingsOpen(prev => !prev)}
                className="text-gray-600 hover:text-gray-900 cursor-pointer"
              >
                Settings
              </button>

              {settingsOpen && (
                <div
                  data-testid="settings-dropdown"
                  className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-10"
                >
                  <Link
                    to="/settings/s3_credential"
                    onClick={() => setSettingsOpen(false)}
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    S3 Credentials
                  </Link>
                </div>
              )}
            </div>

            <button
              onClick={handleLogout}
              className="bg-red-500 hover:bg-red-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors cursor-pointer"
            >
              Logout
            </button>
          </>
        ) : (
          <Link to="/login" className="text-gray-600 hover:text-gray-900">Login</Link>
        )}
      </div>
    </nav>
  );
}
