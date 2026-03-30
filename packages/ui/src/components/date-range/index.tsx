import type { DateRangeFilter } from '@cdoprof/shared-types';
import type { ReactElement } from 'react';

export const DateRangeField = ({ value, onChange }: { value: DateRangeFilter; onChange: (value: DateRangeFilter) => void }): ReactElement => (
  <div>
    <input type="date" value={value.from?.slice(0, 10) ?? ''} onChange={(e) => onChange({ ...value, from: e.target.value })} />
    <input type="date" value={value.to?.slice(0, 10) ?? ''} onChange={(e) => onChange({ ...value, to: e.target.value })} />
  </div>
);
