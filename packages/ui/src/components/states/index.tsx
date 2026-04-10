import type { ReactElement } from 'react';

export const EmptyState = ({ message = 'No data yet' }: { message?: string }): ReactElement => (
  <div className="ui-empty">{message}</div>
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
  <div className="ui-loading">{message}</div>
);
