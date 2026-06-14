import { VISUALLY_HIDDEN_CLASS, fieldId } from '../../a11y/visually-hidden';

import type { ReactElement } from 'react';

export const SearchInput = ({
  value,
  onChange,
  label = 'Поиск',
  placeholder = 'Поиск'
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
}): ReactElement => {
  const id = fieldId(label, 'input');
  return (
    <>
      <label className={VISUALLY_HIDDEN_CLASS} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="ui-input"
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </>
  );
};
