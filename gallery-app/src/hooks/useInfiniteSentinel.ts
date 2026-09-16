import { useEffect, useRef } from 'react';

// Calls onIntersect when the element the returned ref is attached to scrolls into view.
// jsdom has no IntersectionObserver, so the test setup installs a no-op one and the tests
// that care about the intersection replace it with a stub they trigger by hand.
export function useInfiniteSentinel<T extends Element>(enabled: boolean, onIntersect: () => void) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!enabled || !node) return;

    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) onIntersect();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, onIntersect]);

  return ref;
}
