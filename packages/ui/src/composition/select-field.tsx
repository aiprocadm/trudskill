import { fieldId } from '../a11y/visually-hidden';

import type { ReactElement, ReactNode, SelectHTMLAttributes } from 'react';

export interface SelectFieldOption {
  value: string;
  label: string;
}

export const SelectField = ({
  label,
  hint,
  error,
  options,
  children,
  ...props
}: {
  label: string;
  hint?: string;
  error?: string;
  options?: SelectFieldOption[];
  children?: ReactNode;
} & SelectHTMLAttributes<HTMLSelectElement>): ReactElement => {
  const hintId = hint ? fieldId(label, 'hint') : undefined;
  const errorId = error ? fieldId(label, 'error') : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <label className="ui-field">
      <span className="ui-field-label">
        {label}
        {props.required ? ' *' : ''}
      </span>
      <select
        className="ui-select"
        aria-invalid={Boolean(error)}
        {...(describedBy ? { 'aria-describedby': describedBy } : {})}
        {...props}
      >
        {options
          ? options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))
          : children}
      </select>
      {hint ? (
        <p id={hintId} className="ui-field-hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="ui-field-error" role="alert">
          {error}
        </p>
      ) : null}
    </label>
  );
};
