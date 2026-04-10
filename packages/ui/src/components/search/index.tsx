import type { ReactElement } from 'react';

export const SearchInput = ({
  value,
  onChange
}: {
  value: string;
  onChange: (value: string) => void;
}): ReactElement => (
  <input
    className="ui-input"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder="Search"
  />
);
