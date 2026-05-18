import { useCreateAlbum } from "@/features/albums/albums.ts";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

export function AlbumForm() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const createAlbum = useCreateAlbum();
  const navigate = useNavigate();

  const handleSubmit: React.SubmitEventHandler<HTMLFormElement> = (e) => {
    e.preventDefault();
    createAlbum.mutate(
      {name, description},
      {
        onSuccess: () => {
          navigate("/albums");
        }
      }
    );
  };

  return (
    <main className="max-w-lg mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold text-gray-800 mb-8">New Album</h1>

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

        {createAlbum.isError && (
          <p className="text-sm text-red-500" data-testid="error-label">Failed to create album.</p>
        )}

        <div className="flex gap-3 mt-2">
          <button
            type="button"
            onClick={() => navigate('/albums')}
            data-testid="cancel-button"
            className="flex-1 border border-gray-300 text-gray-700 font-semibold py-2 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={createAlbum.isPending}
            data-testid="submit-button"
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2 rounded-lg transition-colors"
          >
            {createAlbum.isPending ? 'Creating...' : 'Create'}
          </button>
        </div>
      </form>
    </main>
  );
}