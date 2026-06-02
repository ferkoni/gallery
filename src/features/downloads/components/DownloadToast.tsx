import { memo } from 'react';
import type { DownloadItem, DownloadStatus } from '../store/downloadStore';
import { useDownloadStore } from '../store/downloadStore';

const statusLabel: Record<DownloadStatus, string> = {
  pending: 'Preparing…',
  ready: 'Ready',
  failed: 'Failed',
};

const statusColor: Record<DownloadStatus, string> = {
  pending: 'text-blue-500',
  ready: 'text-green-500',
  failed: 'text-red-500',
};

type Props = {
  item: DownloadItem;
  onRetry?: (item: DownloadItem) => void;
};

export const DownloadToast = memo(function DownloadToast({ item, onRetry }: Props) {
  const { remove } = useDownloadStore();

  return (
    <div className="text-sm" data-testid={`download-item-${item.taskId}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate max-w-[160px] text-gray-700">{item.albumName}</span>
        <span className={`text-xs font-medium ${statusColor[item.status]}`}>
          {statusLabel[item.status]}
        </span>
      </div>

      {item.status === 'ready' && (
        <a
          href={item.url}
          download
          className="text-xs text-blue-500 hover:text-blue-700 font-medium mt-1 block"
        >
          Save file
        </a>
      )}

      {item.status === 'failed' && (
        <div className="flex items-center justify-between mt-1">
          {item.error && <p className="text-xs text-red-500">{item.error}</p>}
          {onRetry && (
            <button
              onClick={() => onRetry(item)}
              className="text-xs text-blue-500 hover:text-blue-700 font-medium cursor-pointer"
            >
              Try again
            </button>
          )}
        </div>
      )}

      {item.status !== 'pending' && (
        <button
          onClick={() => remove(item.taskId)}
          aria-label="Dismiss"
          className="text-xs text-gray-400 hover:text-gray-600 mt-1 cursor-pointer"
        >
          Dismiss
        </button>
      )}
    </div>
  );
});
