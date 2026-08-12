'use client';

import { SectionError } from '../../components/state-wrappers';
import { ApiClientError } from '../../lib/api/client';

/*
 * Общий слой экранов монолита (§8.3 «Границы разбиения»): пока последний экран не уехал
 * из `features/mvp/screens.tsx`, разделяемые мелочи живут здесь, рядом с `hooks.ts`.
 * Вынесены при разбиении волны 1 (Фаза 4 редизайна, срез 2) — экраны групп и карточка
 * слушателя переехали в свои папки, а эти помощники нужны и им, и оставшимся экранам.
 */
export const PaginationControls = ({
  page,
  setPage,
  total,
  pageSize
}: {
  page: number;
  setPage: (page: number) => void;
  total: number | undefined;
  pageSize: number;
}) => {
  const canPrev = page > 1;
  const canNext = total ? page * pageSize < total : true;
  return (
    <div className="ui-inline">
      <button type="button" disabled={!canPrev} onClick={() => setPage(page - 1)}>
        Назад
      </button>
      <span>Страница {page}</span>
      <button type="button" disabled={!canNext} onClick={() => setPage(page + 1)}>
        Далее
      </button>
    </div>
  );
};

export const readApiMessage = (error: unknown) => {
  if (error instanceof ApiClientError) return error.normalized.message;
  if (error instanceof Error) return error.message;
  return 'Не удалось выполнить действие';
};

export const ProgressBar = ({ value }: { value: number }) => (
  <div className="ui-stack" style={{ gap: 4 }}>
    <progress max={100} value={value} />
    <small className="ui-text-muted">{value}%</small>
  </div>
);

export const MutationError = ({ message }: { message: string | null }) =>
  message ? <SectionError message={message} /> : null;
