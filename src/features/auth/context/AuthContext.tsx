import { createContext } from "react";

type AuthContextType = {
  token: string | null;
  login: (token: string) => void;
  logout: () => void;
  s3CredentialConfigured: boolean;
  setS3CredentialConfigured: (value: boolean) => void;
}

export const AuthContext = createContext<AuthContextType | null>(null);