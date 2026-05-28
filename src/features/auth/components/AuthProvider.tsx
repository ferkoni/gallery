import { useState } from 'react';
import { AuthContext } from "@/features/auth/context/AuthContext.tsx";
import { getToken, setToken } from "@/lib/api/tokenStore";

const S3_CREDENTIAL_KEY = 's3CredentialConfigured';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(getToken);
  const [s3CredentialConfigured, setS3CredentialConfiguredState] = useState<boolean>(
    localStorage.getItem(S3_CREDENTIAL_KEY) === 'true'
  );

  const login = (newToken: string) => {
    setToken(newToken);
    setTokenState(newToken);
  };

  const logout = () => {
    setToken(null);
    localStorage.removeItem(S3_CREDENTIAL_KEY);
    setTokenState(null);
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
