type Props = {
  onClick: () => void;
  'aria-label'?: string;
  'data-testid'?: string;
};

export function CardEditButton({ onClick, 'aria-label': ariaLabel = 'Edit', 'data-testid': testId }: Props) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 bg-white/80 hover:bg-white text-gray-600 hover:text-gray-900 hover:scale-110 rounded-full p-1.5 shadow transition-all"
      aria-label={ariaLabel}
      title="Edit"
      data-testid={testId}
    >
      ✏
    </button>
  );
}
