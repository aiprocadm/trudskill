import type { LookupItem } from '@cdoprof/shared-types';
import type { ReactElement } from 'react';

export const LookupSelect = ({ items, value, onChange }: { items: LookupItem[]; value?: string; onChange: (value: string) => void }): ReactElement => (
  <select value={value} onChange={(e) => onChange(e.target.value)}>
    {items.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
  </select>
);
