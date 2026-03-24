import type { ReactElement } from 'react';

export const Pagination = ({ page, totalPages, onPageChange }: { page: number; totalPages: number; onPageChange: (next: number) => void }): ReactElement => (
  <div>
    <button disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Prev</button>
    <span>{page} / {totalPages}</span>
    <button disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Next</button>
  </div>
);
