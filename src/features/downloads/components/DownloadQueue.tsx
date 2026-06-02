import { useDownloadStore } from '../store/downloadStore';
import { DownloadToast } from './DownloadToast';
import { useDownloadAlbum } from '../hooks/useDownloadAlbum';
import type { DownloadItem } from '../store/downloadStore';

export function DownloadQueue() {
  const { downloads } = useDownloadStore();
  const { downloadAlbum } = useDownloadAlbum();
  const items = Object.values(downloads);

  if (items.length === 0) return null;

  function handleRetry(item: DownloadItem) {
    useDownloadStore.getState().remove(item.taskId);
    downloadAlbum(item.taskId, item.albumName);
  }

  return (
    <div
      className="fixed bottom-4 right-4 w-72 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden z-50"
      data-testid="download-queue"
    >
      <div className="flex items-center px-4 py-3 border-b border-gray-100">
        <span className="text-sm font-semibold text-gray-700">Downloads</span>
      </div>
      <ul className="max-h-64 overflow-y-auto divide-y divide-gray-100">
        {items.map((item) => (
          <li key={item.taskId} className="px-4 py-3">
            <DownloadToast item={item} onRetry={handleRetry} />
          </li>
        ))}
      </ul>
    </div>
  );
}
