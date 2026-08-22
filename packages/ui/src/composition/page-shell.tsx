import { EmptyState, ErrorState, LoadingState } from '../components/states/index.js';

import type { PropsWithChildren, ReactElement, ReactNode } from 'react';

/**
 * `CMP-015` / `CMP-020` — каркас страницы переезжает из приложения в пакет.
 *
 * До переезда `PageContainer`/`PageHeader`/`SectionCard` и обёртки состояний жили в
 * `apps/frontend/src/components/state-wrappers.tsx`: ими пользуются десятки экранов, их
 * требует governance §5 и проверяет сторож `unified-states` — то есть это фактический
 * стандарт, который лежал вне дизайн-системы. Прежний файл остаётся тонкой прослойкой
 * на одну фазу (реэкспорт + разбор ошибок приложения), экраны переводятся волнами.
 */

/** Действие шапки: подпись называет результат (`TXT-002`), обработчик его выполняет. */
export interface PageAction {
  label: string;
  onSelect: () => void;
}

export const GlobalLoading = ({ message }: { message?: string }): ReactElement => (
  <LoadingState message={message ?? 'Загрузка приложения...'} />
);

export const GlobalError = ({ message }: { message?: string }): ReactElement => (
  <ErrorState message={message ?? 'Произошла непредвиденная ошибка'} />
);

/**
 * Ошибка секции. Пакетная версия принимает готовые строки: разбор пойманного объекта
 * ошибки (`TXT-004`, словарь `describeError`) — дело приложения, он остаётся в прослойке
 * `state-wrappers` — по той же причине, по которой `CMP-022` оставляет там `FieldError`.
 */
export const SectionError = ({
  message,
  details,
  onRetry
}: {
  message?: string;
  details?: string;
  onRetry?: () => void;
}): ReactElement => (
  <div className="ui-stack">
    <ErrorState
      message={message ?? 'Не удалось загрузить секцию'}
      {...(details ? { details } : {})}
    />
    {onRetry ? (
      <button type="button" className="ui-button" onClick={onRetry}>
        Повторить
      </button>
    ) : null}
  </div>
);

export const SectionEmpty = ({
  message,
  hint
}: {
  message?: string;
  hint?: string;
}): ReactElement => {
  const resolvedMessage = message ?? 'Пока нет данных';
  if (hint !== undefined && hint !== '') {
    return <EmptyState message={resolvedMessage} hint={hint} />;
  }
  return <EmptyState message={resolvedMessage} />;
};

export const SectionCard = ({
  title,
  subtitle,
  actions,
  children
}: PropsWithChildren<{ title: string; subtitle?: string; actions?: ReactNode }>): ReactElement => (
  <section className="ui-section-card">
    <div className="ui-section-head">
      <div>
        <h3 className="ui-section-title">{title}</h3>
        {subtitle ? <p className="ui-page-subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="ui-inline">{actions}</div> : null}
    </div>
    {children}
  </section>
);

/**
 * `UI-016`: у дашборда и формы — просторный контекст (между блоками 32, карточки 24).
 * Обычные экраны остаются плотными; модификатор включают только «обзорные» страницы.
 */
export const PageContainer = ({
  children,
  spacious
}: PropsWithChildren<{ spacious?: boolean }>): ReactElement => (
  <main className={spacious ? 'ui-page ui-page--spacious' : 'ui-page'}>{children}</main>
);

/**
 * Шапка страницы (`CMP-015`).
 *
 * ⚠️ `primaryAction` — **не массив**, и это осознанное ограничение типа: бюджет `UI-007`
 * «одно первичное действие на экран» перестаёт быть договорённостью, которую забудут, —
 * второй primary некуда передать. Остальные действия уходят в меню «Ещё» и рисуются
 * нейтральными: они не соревнуются с первичной кнопкой (`UI-003`).
 *
 * `actions` — переходный слот на время волнового переезда (`CMP-020`): им пользуются
 * экраны, ещё не переведённые на `primaryAction`. Слот исключает первичную кнопку на
 * уровне типа, чтобы «переходность» не стала способом обойти бюджет. Список оставшихся
 * держит сторож `page-header-actions-ratchet` — новым файлам слот недоступен.
 */
export type PageHeaderProps = {
  title: string;
  subtitle?: string;
  breadcrumbsSlot?: ReactNode;
} & (
  | {
      primaryAction?: PageAction;
      secondaryActions?: PageAction[];
      actions?: never;
    }
  | { actions?: ReactNode; primaryAction?: never; secondaryActions?: never }
);

export const PageHeader = (props: PageHeaderProps): ReactElement => {
  const { title, subtitle, breadcrumbsSlot } = props;
  const primaryAction = 'primaryAction' in props ? props.primaryAction : undefined;
  const secondaryActions = 'secondaryActions' in props ? props.secondaryActions : undefined;
  const legacyActions = 'actions' in props ? props.actions : undefined;

  return (
    <header className="ui-page-header">
      <div>
        {breadcrumbsSlot ?? null}
        <h1 className="ui-page-title">{title}</h1>
        {subtitle ? <p className="ui-page-subtitle">{subtitle}</p> : null}
      </div>
      {primaryAction || secondaryActions?.length || legacyActions ? (
        <div className="ui-inline">
          {legacyActions ?? null}
          {primaryAction ? (
            <button
              type="button"
              className="ui-button ui-button--primary"
              onClick={primaryAction.onSelect}
            >
              {primaryAction.label}
            </button>
          ) : null}
          {secondaryActions?.length ? (
            <details className="ui-header-menu">
              <summary className="ui-button" aria-label="Ещё действия">
                Ещё
              </summary>
              <div className="ui-header-menu__list" role="menu">
                {secondaryActions.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    role="menuitem"
                    className="ui-header-menu__item"
                    onClick={action.onSelect}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      ) : null}
    </header>
  );
};
