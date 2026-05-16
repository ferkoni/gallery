import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();
import './index.css';
import App from './App.tsx';
import { AuthProvider } from "./features/auth/components/AuthProvider";

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App/>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>
);
