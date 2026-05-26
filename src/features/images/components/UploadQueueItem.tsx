import type { UploadItem } from '../store/uploadStore';

const statusLabel: Record<string, string> = {
  pending: 'Pending',
  uploading: 'Uploading',
  done: 'Done',
  error: 'Error',
};

const statusColor: Record<string, string> = {
  pending: 'text-gray-500',
  uploading: 'text-blue-500',
  done: 'text-green-500',
  error: 'text-red-500',
};

type Props = { item: UploadItem };

export function UploadQueueItem({ item }: Props) {
  return (
    <div className="text-sm" data-testid={`upload-item-${item.id}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate max-w-[160px] text-gray-700">{item.file.name}</span>
        <span className={`text-xs font-medium ${statusColor[item.status]}`}>
          {statusLabel[item.status]}
        </span>
      </div>
      {(item.status === 'uploading' || item.status === 'done') && (
        <progress
          value={item.progress}
          max={100}
          className="w-full h-1 mt-1 accent-blue-500"
        />
      )}
      {item.status === 'error' && item.error && (
        <p className="text-xs text-red-500 mt-1">{item.error}</p>
      )}
    </div>
  );
}
