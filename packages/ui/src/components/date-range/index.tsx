import type { DateRangeFilter } from '@trudskill/shared-types';
import type { ReactElement } from 'react';

// Диапазон дат в общем контракте полей: обёртка ui-field + подпись + ui-input у обоих инпутов.
// label необязателен — по умолчанию «Период» (обратная совместимость по API сохранена).
export const DateRangeField = ({
  value,
  onChange,
  label = 'Период'
}: {
  value: DateRangeFilter;
  onChange: (value: DateRangeFilter) => void;
  label?: string;
}): ReactElement => (
  <div className="ui-field">
    <span className="ui-field-label">{label}</span>
    <div className="ui-inline">
      <input
        className="ui-input"
        type="date"
        aria-label={`${label}: с`}
        value={value.from?.slice(0, 10) ?? ''}
        onChange={(e) => onChange({ ...value, from: e.target.value })}
      />
      <input
        className="ui-input"
        type="date"
        aria-label={`${label}: по`}
        value={value.to?.slice(0, 10) ?? ''}
        onChange={(e) => onChange({ ...value, to: e.target.value })}
      />
    </div>
  </div>
);
