import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { userEvent } from '@testing-library/user-event';
import { Pagination } from '@/components/Pagination';

describe('Pagination', () => {
  it('renders nothing when totalPages is 1', () => {
    const { container } = render(
      <Pagination currentPage={1} totalPages={1} onNext={vi.fn()} onPrev={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when totalPages is 0', () => {
    const { container } = render(
      <Pagination currentPage={1} totalPages={0} onNext={vi.fn()} onPrev={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows current page and total pages', () => {
    render(<Pagination currentPage={2} totalPages={5} onNext={vi.fn()} onPrev={vi.fn()} />);
    expect(screen.getByTestId('pagination-info')).toHaveTextContent('2 / 5');
  });

  it('disables Prev button on first page', () => {
    render(<Pagination currentPage={1} totalPages={3} onNext={vi.fn()} onPrev={vi.fn()} />);
    expect(screen.getByTestId('pagination-prev')).toBeDisabled();
  });

  it('disables Next button on last page', () => {
    render(<Pagination currentPage={3} totalPages={3} onNext={vi.fn()} onPrev={vi.fn()} />);
    expect(screen.getByTestId('pagination-next')).toBeDisabled();
  });

  it('calls onNext when Next is clicked', async () => {
    const onNext = vi.fn();
    render(<Pagination currentPage={1} totalPages={3} onNext={onNext} onPrev={vi.fn()} />);
    await userEvent.click(screen.getByTestId('pagination-next'));
    expect(onNext).toHaveBeenCalledOnce();
  });

  it('calls onPrev when Prev is clicked', async () => {
    const onPrev = vi.fn();
    render(<Pagination currentPage={2} totalPages={3} onNext={vi.fn()} onPrev={onPrev} />);
    await userEvent.click(screen.getByTestId('pagination-prev'));
    expect(onPrev).toHaveBeenCalledOnce();
  });
});
