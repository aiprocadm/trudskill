import { Button } from '../components/button/index.js';
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

/**
 * Действие шапки: подпись называет результат (`TXT-002`), а дальше одно из двух —
 * обработчик либо адрес.
 *
 * Форма с `href` появилась при переезде экранов (`CMP-020`, волна 1): половина первичных
 * действий продукта — это переход («Создать курс» ведёт на `/courses/new`), и ссылку надо
 * оставить ссылкой. Иначе теряются средняя кнопка мыши, «открыть в новой вкладке» и
 * подсказка адреса в строке состояния, а незрячий слышит «кнопка» там, где переход.
 * Прецедент в пакете уже был: действие пустого состояния (`EmptyState`) устроено так же.
 */
export type PageAction =
  | {
      label: string;
      onSelect: () => void;
      disabled?: boolean;
      /**
       * Действие выполняется прямо сейчас. Подпись при этом **не меняется** (`TXT-003`):
       * занятость показывает крутилка внутри кнопки, а не второе название. Экран
       * переаттестации переименовывал кнопку «Проверить сроки» в «Проверяем сроки…» —
       * человек терял из виду, что он вообще нажал.
       */
      busy?: boolean;
    }
  | { label: string; href: string };

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
 * Одно действие шапки. Переход рисуется ссылкой, а не кнопкой с обработчиком: тег выбирается
 * по смыслу действия, а внешний вид у обоих одинаковый (`.ui-button` + модификатор).
 */
const renderPrimary = (action: PageAction): ReactElement =>
  'href' in action ? (
    <a className="ui-button ui-button--primary" href={action.href}>
      {action.label}
    </a>
  ) : (
    <Button
      variant="primary"
      onClick={action.onSelect}
      {...(action.disabled ? { disabled: true } : {})}
      {...(action.busy ? { loading: true } : {})}
    >
      {action.label}
    </Button>
  );

/*
 * Пункт меню «Ещё» — не кнопка дизайн-системы: у него нет рамки и фиксированной высоты
 * кнопки, он строка выпадающего списка. Поэтому здесь голая разметка со своим классом,
 * а не `Button` с добавленным классом (`ui-button` навесил бы кнопке рамку внутри меню).
 */
const renderMenuItem = (action: PageAction): ReactElement =>
  'href' in action ? (
    <a key={action.label} className="ui-header-menu__item" role="menuitem" href={action.href}>
      {action.label}
    </a>
  ) : (
    <button
      key={action.label}
      type="button"
      role="menuitem"
      className="ui-header-menu__item"
      onClick={action.onSelect}
      {...(action.disabled ? { disabled: true } : {})}
    >
      {action.label}
    </button>
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
          {primaryAction ? renderPrimary(primaryAction) : null}
          {secondaryActions?.length ? (
            <details className="ui-header-menu">
              <summary className="ui-button" aria-label="Ещё действия">
                Ещё
              </summary>
              <div className="ui-header-menu__list" role="menu">
                {secondaryActions.map((action) => renderMenuItem(action))}
              </div>
            </details>
          ) : null}
        </div>
      ) : null}
    </header>
  );
};
