import type { ReactElement, ReactNode } from 'react';

export interface KeyValueItem {
  label: string;
  value: ReactNode;
}

// Канонический key/value-список деталей сущности (dl.kv-list из foundation.ts).
// Синонимичные классы ui-data-list / ui-defs — легаси, в новых экранах использовать этот компонент.
export const KeyValueList = ({ items }: { items: KeyValueItem[] }): ReactElement => (
  <dl className="kv-list">
    {items.map((item) => (
      <div key={item.label} className="kv-list__row">
        <dt>{item.label}</dt>
        <dd>{item.value}</dd>
      </div>
    ))}
  </dl>
);
