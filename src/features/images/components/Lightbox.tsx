import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useOnClickOutside } from '@/hooks/useOnClickOutside';
import type { Image } from '../types/image';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

type LightboxContextValue = {
  image: Image;
  hasNext: boolean;
  hasPrev: boolean;
  goNext: () => void;
  goPrev: () => void;
  close: () => void;
};

const LightboxContext = createContext<LightboxContextValue | null>(null);

function useLightboxContext() {
  const ctx = useContext(LightboxContext);
  if (!ctx) throw new Error('Lightbox sub-components must be used inside <Lightbox>');
  return ctx;
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

type LightboxProps = {
  images: Image[];
  initialIndex: number;
  onClose: () => void;
  children: React.ReactNode;
};

function LightboxRoot({ images, initialIndex, onClose, children }: LightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  useEffect(() => {
    if (images.length === 0) { onClose(); return; }
    if (currentIndex >= images.length) setCurrentIndex(images.length - 1);
  }, [images.length, currentIndex, onClose]);

  const safeIndex = Math.min(currentIndex, Math.max(0, images.length - 1));
  const image = images[safeIndex];
  const hasNext = safeIndex < images.length - 1;
  const hasPrev = safeIndex > 0;

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && hasNext) setCurrentIndex((i) => i + 1);
      if (e.key === 'ArrowLeft' && hasPrev) setCurrentIndex((i) => i - 1);
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [hasNext, hasPrev, onClose]);

  return (
    <LightboxContext.Provider
      value={{
        image,
        hasNext,
        hasPrev,
        goNext: () => setCurrentIndex(safeIndex + 1),
        goPrev: () => setCurrentIndex(safeIndex - 1),
        close: onClose,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 z-50 flex items-center justify-center"
        data-testid="lightbox"
      >
        {children}
      </div>
    </LightboxContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Overlay
// ---------------------------------------------------------------------------

function LightboxOverlay() {
  const { close } = useLightboxContext();
  return (
    <div
      className="absolute inset-0 bg-black/80"
      onClick={close}
      data-testid="lightbox-overlay"
    />
  );
}

// ---------------------------------------------------------------------------
// Image
// ---------------------------------------------------------------------------

function LightboxImage() {
  const { image } = useLightboxContext();
  return (
    <img
      src={image.url}
      alt={image.title}
      className="relative z-10 max-h-[80vh] max-w-[80vw] object-contain rounded shadow-2xl"
      data-testid="lightbox-image"
    />
  );
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

function LightboxMeta() {
  const { image } = useLightboxContext();

  const uploadDate = new Date(image.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });

  return (
    <div
      className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 text-center text-white"
      data-testid="lightbox-meta"
    >
      <p className="text-sm font-semibold">{image.title}</p>
      {image.description && (
        <p className="text-xs text-gray-300 mt-0.5">{image.description}</p>
      )}
      {image.tags.length > 0 && (
        <p className="text-xs text-gray-400 mt-0.5">{image.tags.join(', ')}</p>
      )}
      <p className="text-xs text-gray-300 mt-0.5">{uploadDate}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Nav
// ---------------------------------------------------------------------------

function LightboxNav() {
  const { goNext, goPrev, hasNext, hasPrev } = useLightboxContext();
  return (
    <>
      <button
        onClick={goPrev}
        disabled={!hasPrev}
        className="absolute left-4 z-10 top-1/2 -translate-y-1/2 text-white text-3xl px-3 py-1 rounded-full bg-black/40 hover:bg-black/60 disabled:opacity-20 disabled:cursor-not-allowed transition-colors cursor-pointer"
        aria-label="Previous image"
        data-testid="lightbox-prev"
      >
        ‹
      </button>
      <button
        onClick={goNext}
        disabled={!hasNext}
        className="absolute right-4 z-10 top-1/2 -translate-y-1/2 text-white text-3xl px-3 py-1 rounded-full bg-black/40 hover:bg-black/60 disabled:opacity-20 disabled:cursor-not-allowed transition-colors cursor-pointer"
        aria-label="Next image"
        data-testid="lightbox-next"
      >
        ›
      </button>
    </>
  );
}

// ---------------------------------------------------------------------------
// Close
// ---------------------------------------------------------------------------

function LightboxClose() {
  const { close } = useLightboxContext();
  return (
    <button
      onClick={close}
      className="absolute top-4 right-4 z-10 text-white text-2xl leading-none px-2 py-1 rounded-full bg-black/40 hover:bg-black/60 transition-colors cursor-pointer"
      aria-label="Close lightbox"
      data-testid="lightbox-close"
    >
      ×
    </button>
  );
}

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

type LightboxMenuProps = {
  onEdit: (image: Image) => void;
  onDelete: (image: Image) => void;
};

function LightboxMenu({ onEdit, onDelete }: LightboxMenuProps) {
  const { image } = useLightboxContext();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOnClickOutside(ref, () => setOpen(false));

  return (
    <div ref={ref} className="absolute top-4 right-16 z-10" data-testid="lightbox-menu">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-white text-xl leading-none px-2 py-1 rounded-full bg-black/40 hover:bg-black/60 transition-colors cursor-pointer"
        aria-label="Image options"
        data-testid="lightbox-menu-button"
      >
        ⋮
      </button>
      {open && (
        <div
          className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-lg overflow-hidden min-w-[120px]"
          data-testid="lightbox-menu-dropdown"
        >
          <button
            onClick={() => { setOpen(false); onEdit(image); }}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
            data-testid="lightbox-menu-edit"
          >
            Edit
          </button>
          <button
            onClick={() => { setOpen(false); onDelete(image); }}
            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
            data-testid="lightbox-menu-delete"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const Lightbox = Object.assign(LightboxRoot, {
  Overlay: LightboxOverlay,
  Image: LightboxImage,
  Meta: LightboxMeta,
  Nav: LightboxNav,
  Close: LightboxClose,
  Menu: LightboxMenu,
});
