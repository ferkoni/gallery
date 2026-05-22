import { useMutation } from "@tanstack/react-query";
import type { S3Credential } from "@/features/settings/types/s3Credential.ts";
import apiClient from "@/lib/api/client.ts";

const PATH = '/api/s3_credentials';

export function useSaveS3Credential() {
  return useMutation({
    mutationFn: (payload: S3Credential) => {
      return apiClient.put(PATH, { s3_credential: payload });
    }
  });
}

export function useDeleteS3Credential() {
  return useMutation({
    mutationFn: () => apiClient.delete(PATH)
  });
}