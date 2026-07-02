import type { ButtonHTMLAttributes, ReactElement, ReactNode } from 'react';

export type ButtonVariant = 'default' | 'primary' | 'secondary' | 'ghost' | 'danger';

// Каноническая кнопка дизайн-системы. Использует ТОЛЬКО BEM-нотацию ui-button--<variant>
// (слитные алиасы ui-button-primary и т.п. считаются легаси и в новых экранах не используются).
export const Button = ({
  variant = 'default',
  loading = false,
  icon,
  children,
  className,
  type = 'button',
  disabled = false,
  ...rest
}: {
  variant?: ButtonVariant;
  loading?: boolean;
  /** Декоративная иконка слева от текста (обычно <Icon icon={...} />; CSS кнопки принудительно рендерит её 16px независимо от size). */
  icon?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>): ReactElement => {
  const classes = [
    'ui-button',
    variant !== 'default' ? `ui-button--${variant}` : '',
    loading ? 'ui-button--loading' : '',
    className ?? ''
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {icon ? (
        <span className="ui-button__icon" aria-hidden={true}>
          {icon}
        </span>
      ) : null}
      {children}
    </button>
  );
};
