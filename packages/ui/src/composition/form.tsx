import type { FormHTMLAttributes, PropsWithChildren, ReactElement } from 'react';

// Одноколоночная форма (класс ui-form, макс-ширина задаётся токеном в forms.ts).
export const Form = ({
  children,
  className,
  ...rest
}: PropsWithChildren<FormHTMLAttributes<HTMLFormElement>>): ReactElement => (
  <form className={['ui-form', className ?? ''].filter(Boolean).join(' ')} {...rest}>
    {children}
  </form>
);

export const FormSection = ({
  title,
  children
}: PropsWithChildren<{ title?: string }>): ReactElement => (
  <fieldset className="ui-fieldset">
    {title ? <legend>{title}</legend> : null}
    {children}
  </fieldset>
);

export const FormActions = ({ children }: PropsWithChildren): ReactElement => (
  <div className="ui-form-actions">{children}</div>
);
