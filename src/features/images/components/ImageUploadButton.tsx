import { useRef } from 'react';
import { useUpload } from '../hooks/useUpload';

type Props = { albumId: number };

export function ImageUploadButton({ albumId }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { upload } = useUpload(albumId);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    files.forEach((file) => upload(file, ''));
    e.target.value = '';
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleChange}
        data-testid="upload-input"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors cursor-pointer"
        data-testid="upload-button"
      >
        + Upload Images
      </button>
    </>
  );
}
