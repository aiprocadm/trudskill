import { VISUALLY_HIDDEN_CLASS, fieldId } from '../../a11y/visually-hidden';

import type { LookupItem } from '@trudskill/shared-types';
import type { ReactElement } from 'react';

export const LookupSelect = ({
  items,
  value,
  onChange,
  label = 'Выбор значения'
}: {
  items: LookupItem[];
  value?: string;
  onChange: (value: string) => void;
  label?: string;
}): ReactElement => {
  const id = fieldId(label, 'input');
  return (
    <>
      <label className={VISUALLY_HIDDEN_CLASS} htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className="ui-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {items.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
    </>
  );
};
