import type { PropsWithChildren, ReactElement } from 'react';

export const FilterBar = ({
  children,
  label = 'Фильтры'
}: PropsWithChildren<{ label?: string }>): ReactElement => (
  <div className="ui-filter-bar" role="group" aria-label={label}>
    {children}
  </div>
);
