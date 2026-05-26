import { useUploadStore } from '../store/uploadStore';
import { UploadQueueItem } from './UploadQueueItem';

export function UploadQueue() {
  const { queue, clearCompleted } = useUploadStore();

  if (queue.length === 0) return null;

  const hasDone = queue.some((i) => i.status === 'done');

  return (
    <div
      className="fixed bottom-4 right-4 w-72 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden z-50"
      data-testid="upload-queue"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <span className="text-sm font-semibold text-gray-700">Uploads</span>
        {hasDone && (
          <button
            type="button"
            onClick={clearCompleted}
            className="text-xs text-blue-500 hover:text-blue-700 font-medium"
            data-testid="clear-done-button"
          >
            Clear done
          </button>
        )}
      </div>
      <ul className="max-h-64 overflow-y-auto divide-y divide-gray-100">
        {queue.map((item) => (
          <li key={item.id} className="px-4 py-3">
            <UploadQueueItem item={item} />
          </li>
        ))}
      </ul>
    </div>
  );
}
