import { memo } from 'react';

type Props = {
  message: string;
  // Optional, so the same pill carries an error that nothing can undo (docs:
  // select-and-move/02, decision 12). Without it the Undo button isn't rendered.
  onUndo?: () => void;
  onDismiss: () => void;
};

export const UndoToast = memo(function UndoToast({ message, onUndo, onDismiss }: Props) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-gray-800 text-white text-sm px-4 py-3 rounded-xl shadow-lg z-50"
    >
      <span>{message}</span>
      {onUndo && (
        <button
          onClick={onUndo}
          className="font-semibold text-red-400 hover:text-red-300 transition-colors cursor-pointer"
        >
          Undo
        </button>
      )}
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="text-gray-400 hover:text-white transition-colors leading-none cursor-pointer"
      >
        ✕
      </button>
    </div>
  );
});
