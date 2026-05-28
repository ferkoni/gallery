import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthContext } from '@/features/auth/hooks/useAuthContext';
import { useOnClickOutside } from '@/hooks/useOnClickOutside';

export function NavBar() {
  const { token, logout } = useAuthContext();
  const navigate = useNavigate();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  useOnClickOutside(settingsRef, () => setSettingsOpen(false));

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <nav className="bg-white shadow px-6 py-4 flex items-center justify-between">
      <Link to="/" className="text-xl font-bold text-gray-800">Gallery</Link>

      <div className="flex items-center gap-4">
        {token ? (
          <>
            <Link to="/albums" className="text-gray-600 hover:text-gray-900">Albums</Link>

            <div ref={settingsRef} className="relative">
              <button
                data-testid="settings-menu-button"
                onClick={() => setSettingsOpen(prev => !prev)}
                className="text-gray-600 hover:text-gray-900"
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
              className="bg-red-500 hover:bg-red-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
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
