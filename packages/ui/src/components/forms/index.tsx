import type { InputHTMLAttributes, ReactElement, TextareaHTMLAttributes } from 'react';

export const FormField = ({
  label,
  ...props
}: { label: string } & InputHTMLAttributes<HTMLInputElement>): ReactElement => (
  <label className="ui-stack" style={{ gap: 4 }}>
    <span>{label}</span>
    <input className="ui-input" {...props} />
  </label>
);

export const TextareaField = ({
  label,
  ...props
}: { label: string } & TextareaHTMLAttributes<HTMLTextAreaElement>): ReactElement => (
  <label className="ui-stack" style={{ gap: 4 }}>
    <span>{label}</span>
    <textarea className="ui-textarea" {...props} />
  </label>
);
