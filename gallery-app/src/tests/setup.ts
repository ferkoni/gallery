import '@testing-library/jest-dom';

// jsdom implements no IntersectionObserver, and anything that lazily loads on scroll
// constructs one on mount. This no-op keeps those components mountable; a test that
// cares about the intersection replaces it with a stub it can trigger by hand.
class NoopIntersectionObserver {
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds: readonly number[] = [];
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] { return []; }
}

globalThis.IntersectionObserver ??= NoopIntersectionObserver as unknown as typeof IntersectionObserver;
