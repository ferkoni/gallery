import { memo } from 'react';
import type { DownloadItem, DownloadStatus } from '../store/downloadStore';
import { useDownloadStore } from '../store/downloadStore';

const statusLabel: Record<DownloadStatus, string> = {
  pending: 'Preparing your download…',
  completed: 'Download ready',
  failed: 'Failed',
};

const statusColor: Record<DownloadStatus, string> = {
  pending: 'text-link',
  completed: 'text-success',
  failed: 'text-danger',
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
        <span className="truncate max-w-[160px] text-body">{item.albumName}</span>
        <span className={`text-xs font-medium ${statusColor[item.status]}`}>
          {statusLabel[item.status]}
        </span>
      </div>

      {item.status === 'completed' && (
        <a
          href={item.url}
          download={`${item.albumName} ${item.completedAt}.zip`}
          className="text-xs text-link hover:text-link-strong font-medium mt-1 block"
        >
          Save file
        </a>
      )}

      {item.status === 'failed' && (
        <div className="flex items-center justify-between mt-1">
          {item.error && <p className="text-xs text-danger">{item.error}</p>}
          {onRetry && (
            <button
              onClick={() => onRetry(item)}
              className="text-xs text-link hover:text-link-strong font-medium cursor-pointer"
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
          className="text-xs text-faint hover:text-secondary mt-1 cursor-pointer"
        >
          Dismiss
        </button>
      )}
    </div>
  );
});
