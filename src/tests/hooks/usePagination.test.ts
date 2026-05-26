import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { usePagination } from '@/hooks/usePagination';

describe('usePagination', () => {
  it('starts at page 1', () => {
    const { result } = renderHook(() => usePagination());
    expect(result.current.page).toBe(1);
  });

  it('goNext increments the page', () => {
    const { result } = renderHook(() => usePagination());
    act(() => result.current.goNext());
    expect(result.current.page).toBe(2);
  });

  it('goPrev decrements the page', () => {
    const { result } = renderHook(() => usePagination());
    act(() => result.current.goNext());
    act(() => result.current.goPrev());
    expect(result.current.page).toBe(1);
  });

  it('goPrev does not go below page 1', () => {
    const { result } = renderHook(() => usePagination());
    act(() => result.current.goPrev());
    expect(result.current.page).toBe(1);
  });

  it('goToPage sets the page directly', () => {
    const { result } = renderHook(() => usePagination());
    act(() => result.current.goToPage(5));
    expect(result.current.page).toBe(5);
  });

  it('reset returns to page 1', () => {
    const { result } = renderHook(() => usePagination());
    act(() => result.current.goToPage(4));
    act(() => result.current.reset());
    expect(result.current.page).toBe(1);
  });
});
