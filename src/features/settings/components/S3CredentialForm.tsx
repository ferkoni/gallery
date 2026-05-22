import { z } from "zod";
import type { S3Credential } from "@/features/settings/types/s3Credential.ts";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

const s3CredentialSchema = z.object({
  access_key_id: z.string().min(1, 'Required').max(255),
  secret_access_key: z.string().min(1, 'Required').max(255),
  region: z.string().min(1, "Required").regex(/^[a-z]{2,3}-[a-z]+-\d$/, "Invalid region format"),
  bucket: z.string().min(1, 'Required')
});

type S3CredentialFormData = z.infer<typeof s3CredentialSchema>;

type S3CredentialFormProps = {
  onSubmit: (data: S3Credential) => void;
  onDelete: () => void;
  isPending: boolean;
  isError: boolean;
  isDeleting: boolean;
  isDeleteError: boolean;
};

export function S3CredentialForm({
  onSubmit,
  onDelete,
  isPending,
  isError,
  isDeleting,
  isDeleteError
}: S3CredentialFormProps) {
  const { register, handleSubmit, formState: { errors }} = useForm<S3CredentialFormData>({
    resolver: zodResolver(s3CredentialSchema)
  });

  return (
    <main className="max-w-lg mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold text-gray-800 mb-8">Add S3 Credentials</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Access Key ID</label>
          <input
            {...register("access_key_id")}
            type="password"
            data-testid="access-key-id-input"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {errors.access_key_id && (
            <p className="text-xs text-red-500" data-testid="access-key-id-error-label">{errors.access_key_id.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Secret Access Key</label>
          <input
            {...register("secret_access_key")}
            type="password"
            data-testid="secret-access-key-input"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {errors.secret_access_key && (
            <p className="text-xs text-red-500" data-testid="secret-access-key-error-label">{errors.secret_access_key.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Region</label>
          <input
            {...register("region")}
            type="text"
            data-testid="region-input"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {errors.region && (
            <p className="text-xs text-red-500" data-testid="region-error-label">{errors.region.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Bucket</label>
          <input
            {...register("bucket")}
            type="text"
            data-testid="bucket-input"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {errors.bucket && (
            <p className="text-xs text-red-500" data-testid="bucket-error-label">{errors.bucket.message}</p>
          )}
        </div>

        {isError && (
          <p className="text-sm text-red-500" data-testid="error-label">Failed to add S3 Credentials</p>
        )}

        {isDeleteError && (
          <p className="text-sm text-red-500" data-testid="delete-error-label">Failed to delete S3 Credentials</p>
        )}

        <div className="flex gap-3 mt-2">
          <button
            type="button"
            disabled={isDeleting}
            onClick={onDelete}
            data-testid="delete-button"
            className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2 rounded-lg"
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
          <button
            type="submit"
            disabled={isPending}
            data-testid="submit-button"
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2 rounded-lg transition-colors"
          >
            {isPending ? "Adding..." : "Add"}
          </button>
        </div>
      </form>
    </main>
  );
}