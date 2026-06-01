import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useDebounce } from '@/hooks/useDebounce';

describe('useDebounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('hello', 300));
    expect(result.current).toBe('hello');
  });

  it('does not update before the delay has elapsed', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: 'hello' } }
    );

    act(() => {
      rerender({ value: 'world' });
      vi.advanceTimersByTime(299);
    });

    expect(result.current).toBe('hello');
  });

  it('updates after the delay has elapsed', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: 'hello' } }
    );

    act(() => { rerender({ value: 'world' }); });
    act(() => { vi.advanceTimersByTime(300); });

    expect(result.current).toBe('world');
  });

  it('only uses the last value when updated rapidly', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: 'a' } }
    );

    act(() => { rerender({ value: 'b' }); });
    act(() => { vi.advanceTimersByTime(100); });
    act(() => { rerender({ value: 'c' }); });
    act(() => { vi.advanceTimersByTime(100); });
    act(() => { rerender({ value: 'd' }); });
    act(() => { vi.advanceTimersByTime(300); });

    expect(result.current).toBe('d');
  });
});
