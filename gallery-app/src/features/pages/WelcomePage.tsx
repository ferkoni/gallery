import { useContext } from 'react';
import { Link } from 'react-router-dom';
import { AuthContext } from '@/features/auth/context/AuthContext';

export function WelcomePage() {
  const ctx = useContext(AuthContext);
  if (!ctx) return null;
  const { token } = ctx;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gray-100">
      <h1 className="text-4xl font-bold text-gray-800 mb-4">Gallery</h1>
      <p className="text-gray-500 mb-8">Your photos, organized.</p>
      <Link
        to={token ? '/albums' : '/login'}
        className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
      >
        {token ? 'Go to albums' : 'Get started'}
      </Link>
    </main>
  );
}