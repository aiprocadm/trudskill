import type { ReactElement } from 'react';

/**
 * Меню «…» (ТЗ «Стабилизация, UX и развитие», 5.1 / Э1; канон — `CMP-001`).
 *
 * Пункт меню — не кнопка дизайн-системы: у него нет рамки и фиксированной высоты, он строка
 * выпадающего списка (тот же приём, что у меню «Ещё» в шапке страницы). Опасные пункты —
 * внизу, отдельной секцией, красным: человек не нажмёт «Приостановить центр», целясь в
 * «Сменить тариф».
 *
 * Разметка на `<details>`: открывается и закрывается без JS-состояния, доступна с клавиатуры,
 * поэтому компонент без хуков и проверяется как функция (в пакете нет RTL — RISK-002).
 */
export interface OverflowMenuItem {
  label: string;
  onSelect: () => void;
  /** Необратимое или опасное — уходит в нижнюю секцию, красным. */
  danger?: boolean;
  disabled?: boolean;
}

export const OverflowMenu = ({
  items,
  ariaLabel = 'Ещё действия',
  summary = '…'
}: {
  items: OverflowMenuItem[];
  ariaLabel?: string;
  summary?: string;
}): ReactElement | null => {
  const safe = items.filter((item) => !item.danger);
  const danger = items.filter((item) => item.danger);
  if (safe.length === 0 && danger.length === 0) return null;

  const renderItem = (item: OverflowMenuItem): ReactElement => (
    <button
      key={item.label}
      type="button"
      role="menuitem"
      className={
        item.danger
          ? 'ui-overflow-menu__item ui-overflow-menu__item--danger'
          : 'ui-overflow-menu__item'
      }
      onClick={item.onSelect}
      {...(item.disabled ? { disabled: true } : {})}
    >
      {item.label}
    </button>
  );

  return (
    <details className="ui-overflow-menu">
      <summary className="ui-button ui-button--ghost" aria-label={ariaLabel}>
        {summary}
      </summary>
      <div className="ui-overflow-menu__list" role="menu">
        {safe.map(renderItem)}
        {safe.length > 0 && danger.length > 0 ? (
          <div className="ui-overflow-menu__divider" role="separator" />
        ) : null}
        {danger.map(renderItem)}
      </div>
    </details>
  );
};
