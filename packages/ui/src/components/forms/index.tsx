import type { InputHTMLAttributes, ReactElement } from 'react';

export const FormField = ({ label, ...props }: { label: string } & InputHTMLAttributes<HTMLInputElement>): ReactElement => (
  <label style={{ display: 'grid', gap: 4 }}>
    <span>{label}</span>
    <input {...props} />
  </label>
);
