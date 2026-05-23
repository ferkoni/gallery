import { useMutation } from "@tanstack/react-query";
import { loginRequest } from "@/features/auth/api/authApi.ts";
import { AuthContext } from "@/features/auth/context/AuthContext.tsx";
import { useContext } from "react";

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  const { login, setS3CredentialConfigured } = ctx;

  const loginMutation = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      loginRequest(email, password),
    onSuccess: ({ data }) => {
      login(data.token);
      setS3CredentialConfigured(
        data.user?.data?.attributes?.s3_credential_configured ?? false
      );
    }
  });

  return { loginMutation };
}