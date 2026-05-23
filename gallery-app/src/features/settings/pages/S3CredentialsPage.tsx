import { useContext } from "react";
import { S3CredentialForm } from "@/features/settings/components/S3CredentialForm.tsx";
import { useDeleteS3Credential, useSaveS3Credential } from "@/features/settings/s3Credentials.ts";
import { AuthContext } from "@/features/auth/context/AuthContext.tsx";

export function S3CredentialsPage() {
  const { s3CredentialConfigured } = useContext(AuthContext)!;
  const saveS3Credential = useSaveS3Credential();
  const deleteS3Credential = useDeleteS3Credential();

  return (
    <S3CredentialForm
      configured={s3CredentialConfigured}
      onSubmit={(data) => saveS3Credential.mutate(data)}
      onDelete={() => deleteS3Credential.mutate()}
      isPending={saveS3Credential.isPending}
      isError={saveS3Credential.isError}
      isDeleting={deleteS3Credential.isPending}
      isDeleteError={deleteS3Credential.isError}
    />
  );
}