import { useMutation } from "@tanstack/react-query";
import type { S3Credential } from "@/features/settings/types/s3Credential.ts";
import apiClient from "@/lib/api/client.ts";
import { AuthContext } from "@/features/auth/context/AuthContext.tsx";
import { useContext } from "react";

const PATH = '/api/s3_credentials';

export function useSaveS3Credential() {
  const ctx = useContext(AuthContext);

  return useMutation({
    mutationFn: (payload: S3Credential) =>
      apiClient.put(PATH, { s3_credential: payload }),
    onSuccess: () => ctx?.setS3CredentialConfigured(true)
  });
}

export function useDeleteS3Credential() {
  const ctx = useContext(AuthContext);

  return useMutation({
    mutationFn: () => apiClient.delete(PATH),
    onSuccess: () => ctx?.setS3CredentialConfigured(false)
  });
}