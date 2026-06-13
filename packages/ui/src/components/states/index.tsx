import type { ReactElement } from 'react';

export const EmptyState = ({
  message = 'No data yet',
  hint
}: {
  message?: string;
  hint?: string;
}): ReactElement => (
  <div className="ui-empty" role="status">
    {message}
    {hint ? <p className="ui-empty-hint">{hint}</p> : null}
  </div>
);
export const ErrorState = ({
  message = 'Something went wrong'
}: {
  message?: string;
}): ReactElement => (
  <div className="ui-error" role="alert">
    {message}
  </div>
);
export const LoadingState = ({ message = 'Loading...' }: { message?: string }): ReactElement => (
  <div className="ui-loading" role="status" aria-live="polite" aria-busy="true">
    {message}
  </div>
);
