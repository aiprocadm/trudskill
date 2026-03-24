import type { PropsWithChildren, ReactElement } from 'react';

export const Dialog = ({ title, children }: PropsWithChildren<{ title: string }>): ReactElement => (
  <div role="dialog" aria-label={title}><h3>{title}</h3>{children}</div>
);

export const ConfirmDialog = ({ title, onConfirm }: { title: string; onConfirm: () => void }): ReactElement => (
  <Dialog title={title}><button onClick={onConfirm}>Confirm</button></Dialog>
);
