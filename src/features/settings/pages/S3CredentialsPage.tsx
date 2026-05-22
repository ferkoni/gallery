import { S3CredentialForm } from "@/features/settings/components/S3CredentialForm.tsx";
import { useDeleteS3Credential, useSaveS3Credential } from "@/features/settings/s3Credentials.ts";

export function S3CredentialsPage() {
  const saveS3Credential = useSaveS3Credential();
  const deleteS3Credential = useDeleteS3Credential();

  return (
    <S3CredentialForm
      onSubmit={(data) => {
        saveS3Credential.mutate(data);
      }}
      onDelete={() => deleteS3Credential.mutate()}
      isPending={saveS3Credential.isPending}
      isError={saveS3Credential.isError}
      isDeleting={deleteS3Credential.isPending}
      isDeleteError={deleteS3Credential.isError}/>
  );
}