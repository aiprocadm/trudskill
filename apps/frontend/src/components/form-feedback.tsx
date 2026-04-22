import { type ReactNode, useEffect } from 'react';

export interface FormErrorItem {
  field: string;
  message: string;
}

export const FormErrorSummary = ({
  id,
  title = 'Проверьте форму',
  errors
}: {
  id: string;
  title?: string;
  errors: FormErrorItem[];
}) => {
  if (!errors.length) return null;
  return (
    <div id={id} role="alert" className="ui-error ui-stack" style={{ gap: 6 }}>
      <strong>{title}</strong>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {errors.map((error) => (
          <li key={error.field}>{error.message}</li>
        ))}
      </ul>
    </div>
  );
};

export const FieldHelp = ({ id, children }: { id: string; children?: ReactNode }) =>
  children ? (
    <p id={id} className="ui-field-hint">
      {children}
    </p>
  ) : null;

export const FieldError = ({ id, message }: { id: string; message: string | undefined }) =>
  message ? (
    <p id={id} className="ui-field-error" role="alert">
      {message}
    </p>
  ) : null;

export const useFocusFirstError = (
  errors: FormErrorItem[],
  refs: Record<string, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null>
) => {
  useEffect(() => {
    if (!errors.length) return;
    const firstField = errors[0]?.field;
    if (!firstField) return;
    refs[firstField]?.focus();
  }, [errors, refs]);
};
