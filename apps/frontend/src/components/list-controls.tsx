import { FilterBar } from '@cdoprof/ui';

export const SearchStatusFilter = ({
  q,
  status,
  onQ,
  onStatus
}: {
  q: string;
  status: string;
  onQ: (value: string) => void;
  onStatus: (value: string) => void;
}) => (
  <FilterBar>
    <input
      placeholder="Поиск"
      value={q}
      onChange={(event) => onQ(event.target.value)}
      aria-label="Поиск"
    />
    <select value={status} onChange={(event) => onStatus(event.target.value)} aria-label="Статус">
      <option value="">Все статусы</option>
      <option value="active">active</option>
      <option value="draft">draft</option>
      <option value="archived">archived</option>
    </select>
  </FilterBar>
);

export const SimplePagination = ({
  page,
  canNext,
  onPrev,
  onNext
}: {
  page: number;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}) => (
  <div className="ui-inline">
    <button type="button" disabled={page <= 1} onClick={onPrev}>
      Назад
    </button>
    <span>Стр. {page}</span>
    <button type="button" disabled={!canNext} onClick={onNext}>
      Далее
    </button>
  </div>
);
