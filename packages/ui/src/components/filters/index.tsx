import type { PropsWithChildren, ReactElement } from 'react';

export const FilterBar = ({ children }: PropsWithChildren): ReactElement => (
  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{children}</div>
);
