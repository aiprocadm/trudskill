import type { ReactElement } from 'react';

export const Pagination = ({
  page,
  totalPages,
  onPageChange,
  label = 'Постраничная навигация'
}: {
  page: number;
  totalPages: number;
  onPageChange: (next: number) => void;
  label?: string;
}): ReactElement => (
  <nav className="ui-inline" aria-label={label}>
    <button
      type="button"
      disabled={page <= 1}
      aria-label="Предыдущая страница"
      onClick={() => onPageChange(page - 1)}
    >
      Prev
    </button>
    <span aria-live="polite">
      {page} / {totalPages}
    </span>
    <button
      type="button"
      disabled={page >= totalPages}
      aria-label="Следующая страница"
      onClick={() => onPageChange(page + 1)}
    >
      Next
    </button>
  </nav>
);
