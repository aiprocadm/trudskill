import type { PropsWithChildren, ReactElement } from 'react';

export const FilterBar = ({ children }: PropsWithChildren): ReactElement => (
  <div className="ui-filter-bar">{children}</div>
);
