import { useState } from 'react';
import { AuthContext } from "@/features/auth/context/AuthContext.tsx";

const S3_CREDENTIAL_KEY = 's3CredentialConfigured';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(
    localStorage.getItem('token')
  );
  const [s3CredentialConfigured, setS3CredentialConfiguredState] = useState<boolean>(
    localStorage.getItem(S3_CREDENTIAL_KEY) === 'true'
  );

  const login = (newToken: string) => {
    localStorage.setItem('token', newToken);
    setToken(newToken);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem(S3_CREDENTIAL_KEY);
    setToken(null);
    setS3CredentialConfiguredState(false);
  };

  const setS3CredentialConfigured = (value: boolean) => {
    localStorage.setItem(S3_CREDENTIAL_KEY, String(value));
    setS3CredentialConfiguredState(value);
  };

  return (
    <AuthContext.Provider value={{ token, login, logout, s3CredentialConfigured, setS3CredentialConfigured }}>
      {children}
    </AuthContext.Provider>
  );
}