import { useContext } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthContext } from '@/features/auth/context/AuthContext';

export function NavBar() {
  const ctx = useContext(AuthContext);
  const navigate = useNavigate();

  if (!ctx) return null;
  const { token, logout } = ctx;

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
            <Link to="/settings/s3_credential" className="text-gray-600 hover:text-gray-900">Credential</Link>
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