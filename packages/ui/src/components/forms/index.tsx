import { fieldId } from '../../a11y/visually-hidden';

import type { InputHTMLAttributes, ReactElement, TextareaHTMLAttributes } from 'react';

interface BaseFieldProps {
  label: string;
  hint?: string;
  error?: string;
}

export const FormField = ({
  label,
  hint,
  error,
  ...props
}: BaseFieldProps & InputHTMLAttributes<HTMLInputElement>): ReactElement => {
  const hintId = hint ? fieldId(label, 'hint') : undefined;
  const errorId = error ? fieldId(label, 'error') : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <label className="ui-field">
      <span className="ui-field-label">
        {label}
        {props.required ? ' *' : ''}
      </span>
      <input
        className="ui-input"
        aria-invalid={Boolean(error)}
        {...(describedBy ? { 'aria-describedby': describedBy } : {})}
        {...props}
      />
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

export const TextareaField = ({
  label,
  hint,
  error,
  ...props
}: BaseFieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>): ReactElement => {
  const hintId = hint ? fieldId(label, 'hint') : undefined;
  const errorId = error ? fieldId(label, 'error') : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <label className="ui-field">
      <span className="ui-field-label">
        {label}
        {props.required ? ' *' : ''}
      </span>
      <textarea
        className="ui-textarea"
        aria-invalid={Boolean(error)}
        {...(describedBy ? { 'aria-describedby': describedBy } : {})}
        {...props}
      />
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
