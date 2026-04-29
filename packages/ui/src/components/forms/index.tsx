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
}: BaseFieldProps & InputHTMLAttributes<HTMLInputElement>): ReactElement => (
  <label className="ui-field">
    <span className="ui-field-label">
      {label}
      {props.required ? ' *' : ''}
    </span>
    <input className="ui-input" aria-invalid={Boolean(error)} {...props} />
    {hint ? <p className="ui-field-hint">{hint}</p> : null}
    {error ? <p className="ui-field-error">{error}</p> : null}
  </label>
);

export const TextareaField = ({
  label,
  hint,
  error,
  ...props
}: BaseFieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>): ReactElement => (
  <label className="ui-field">
    <span className="ui-field-label">
      {label}
      {props.required ? ' *' : ''}
    </span>
    <textarea className="ui-textarea" aria-invalid={Boolean(error)} {...props} />
    {hint ? <p className="ui-field-hint">{hint}</p> : null}
    {error ? <p className="ui-field-error">{error}</p> : null}
  </label>
);
