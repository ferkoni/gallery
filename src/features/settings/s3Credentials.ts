import { useMutation } from "@tanstack/react-query";
import type { S3Credential } from "@/features/settings/types/s3Credential.ts";
import apiClient from "@/lib/api/client.ts";
import { useAuthContext } from "@/features/auth/hooks/useAuthContext";

const PATH = '/api/s3_credentials';

export function useSaveS3Credential() {
  const { setS3CredentialConfigured } = useAuthContext();

  return useMutation({
    mutationFn: (payload: S3Credential) =>
      apiClient.put(PATH, { s3_credential: payload }),
    onSuccess: () => setS3CredentialConfigured(true)
  });
}

export function useDeleteS3Credential() {
  const { setS3CredentialConfigured } = useAuthContext();

  return useMutation({
    mutationFn: () => apiClient.delete(PATH),
    onSuccess: () => setS3CredentialConfigured(false)
  });
}
