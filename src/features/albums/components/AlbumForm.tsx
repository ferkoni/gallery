import { useState } from "react";

type AlbumFormData = {
  name: string;
  description: string;
};

type AlbumFormProps = {
  defaultValues?: AlbumFormData;
  onSubmit: (data: AlbumFormData) => void;
  onCancel: () => void;
  isPending: boolean;
  isError: boolean;
  title: string;
  submitLabel: string;
  pendingLabel: string;
  errorMessage: string;
};

export function AlbumForm({
  defaultValues,
  onSubmit,
  onCancel,
  isPending,
  isError,
  title,
  submitLabel,
  pendingLabel,
  errorMessage,
}: AlbumFormProps) {
  const [name, setName] = useState(defaultValues?.name ?? "");
  const [description, setDescription] = useState(defaultValues?.description ?? "");

  const handleSubmit: React.SubmitEventHandler<HTMLFormElement> = (e) => {
    e.preventDefault();
    onSubmit({ name, description });
  };

  return (
    <main className="max-w-lg mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold text-gray-800 mb-8">{title}</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            data-testid="name-input"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Description</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={3}
            data-testid="description-input"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        {isError && (
          <p className="text-sm text-red-500" data-testid="error-label">{errorMessage}</p>
        )}

        <div className="flex gap-3 mt-2">
          <button
            type="button"
            onClick={onCancel}
            data-testid="cancel-button"
            className="flex-1 border border-gray-300 text-gray-700 font-semibold py-2 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            data-testid="submit-button"
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2 rounded-lg transition-colors"
          >
            {isPending ? pendingLabel : submitLabel}
          </button>
        </div>
      </form>
    </main>
  );
}
