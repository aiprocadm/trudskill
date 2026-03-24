import type { ReactElement } from 'react';

export const EmptyState = ({ message = 'No data yet' }: { message?: string }): ReactElement => <div>{message}</div>;
export const ErrorState = ({ message = 'Something went wrong' }: { message?: string }): ReactElement => <div role="alert">{message}</div>;
export const LoadingState = ({ message = 'Loading...' }: { message?: string }): ReactElement => <div>{message}</div>;
