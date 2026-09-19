import { Button } from '../components/button/index.js';
import { HeaderMenu } from '../components/header-menu/index.js';
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
type PageActionBase = {
  label: string;
  disabled?: boolean;
  /**
   * Действие выполняется прямо сейчас. Подпись при этом **не меняется** (`TXT-003`):
   * занятость показывает крутилка внутри кнопки, а не второе название. Экран
   * переаттестации переименовывал кнопку «Проверить сроки» в «Проверяем сроки…» —
   * человек терял из виду, что он вообще нажал.
   */
  busy?: boolean;
  /**
   * Необратимое действие: закрыть группу, перевести центр в архив, отозвать лицензию
   * (для него по Э3 собирается подтверждение с `tone: 'danger'`).
   *
   * Во вторичных действиях рисуется красным и уходит в НИЗ меню «Ещё» — порядок считает
   * сам компонент, а не каждый вызывающий: правило, которое обязан помнить каждый, соблюсти
   * нельзя (урок Э1).
   */
  danger?: boolean;
};

export type PageAction =
  | (PageActionBase & { onSelect: () => void })
  | (PageActionBase & { href: string });

/**
 * Первичное действие экрана (ТЗ «Стабилизация, UX и развитие», 5.4 / Э4).
 *
 * Тот же `PageAction`, но `danger` обязан отсутствовать или быть `false`: **главная кнопка
 * экрана — всегда конструктивное действие**, необратимое живёт во вторичных или в меню «Ещё».
 * Вычисленную опасность (`danger: isDanger` типа `boolean`) тип тоже не пропустит.
 */
export type SafePageAction = PageAction & { danger?: false };

/**
 * `TPL-002` — карточка объекта, которого НЕТ.
 *
 * Зачем отдельное состояние. Экран карточки писался в расчёте на то, что объект найдётся:
 * заголовок брался как `объект?.название ?? «Курс»`, а секции при отсутствии данных
 * показывали свои пустые состояния. В итоге по ссылке на удалённый (или чужой) курс
 * открывалась ПРИЗРАЧНАЯ страница: заголовок «Курс», пустые разделы и рабочая кнопка
 * «Опубликовать курс», которая ничего не публикует. Человек видит настоящую с виду
 * карточку — и не понимает, почему в ней ничего нет.
 *
 * Ссылка «назад» обязательна: страница, с которой некуда уйти, — тупик. Причина названа
 * вслух и обеими возможными («удалили» или «ссылка из другого центра»), потому что сервер
 * отвечает одинаковым «не найдено» в обоих случаях — и угадывать за него нельзя.
 */
export const RecordNotFound = ({
  what,
  backHref,
  backLabel
}: {
  /** Что искали, в именительном падеже: «Курс», «Группа», «Слушатель». */
  what: string;
  backHref: string;
  backLabel: string;
}): ReactElement => (
  <PageContainer>
    <PageHeader title={`${what}: не найден`} />
    <EmptyState
      message={`${what} не найден`}
      hint="Запись могли удалить, или ссылка ведёт в другой учебный центр. Проверьте адрес или вернитесь к списку."
      action={{ label: backLabel, href: backHref }}
    />
  </PageContainer>
);

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
  /* ТЗ 4.4: «Нет данных» запрещено — запасной текст тоже говорит по-человечески. */
  const resolvedMessage = message ?? 'Здесь пока пусто';
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

/**
 * Второстепенное действие, показанное кнопкой. Единственное второстепенное действие в меню
 * не прячут: «Ещё» из одного пункта — это два нажатия вместо одного и скрытая от глаз
 * возможность. Меню начинается с двух пунктов.
 */
const renderSecondary = (action: PageAction): ReactElement =>
  'href' in action ? (
    <a
      key={action.label}
      className={`ui-button ${action.danger ? 'ui-button--danger' : 'ui-button--secondary'}`}
      href={action.href}
    >
      {action.label}
    </a>
  ) : (
    <Button
      key={action.label}
      /* Э4: необратимое действие живёт вторичным — но цветом честно называет себя опасным. */
      variant={action.danger ? 'danger' : 'secondary'}
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
/** Э4: опасный пункт меню — красным, как в меню «…» строки таблицы (Э1). */
const menuItemClass = (action: PageAction): string =>
  action.danger ? 'ui-header-menu__item ui-header-menu__item--danger' : 'ui-header-menu__item';

const renderMenuItem = (action: PageAction): ReactElement =>
  'href' in action ? (
    <a key={action.label} className={menuItemClass(action)} role="menuitem" href={action.href}>
      {action.label}
    </a>
  ) : (
    <button
      key={action.label}
      type="button"
      role="menuitem"
      className={menuItemClass(action)}
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
 * Переходного слота `actions` больше нет: волны 1–3 (`CMP-020`) перевели все 26 экранов,
 * и слот удалён вместе с последним пользователем — иначе «временное» пережило бы всех.
 * Сторож `page-header-actions-ratchet` остался и держит запрет на возврат.
 */
export type PageHeaderProps = {
  title: string;
  subtitle?: string;
  breadcrumbsSlot?: ReactNode;
  /**
   * Служебное содержимое шапки, которое **не является действием страницы**: значок статуса
   * объекта, переключатель роли, листание месяцев в календаре.
   *
   * Слот появился в волне 2 `CMP-020`: часть переходного слота `actions` держали именно такие
   * вещи, и переводить их в `primaryAction`/`secondaryActions` было бы враньём: бюджет
   * `UI-007` считает действия, а значок статуса ничего не делает. Без отдельного слота
   * «переходный» `actions` не умер бы никогда.
   */
  toolsSlot?: ReactNode;
  /** Э4: только конструктивное действие — `danger` тип не пропустит. */
  primaryAction?: SafePageAction;
  secondaryActions?: PageAction[];
};

export const PageHeader = (props: PageHeaderProps): ReactElement => {
  const { title, subtitle, breadcrumbsSlot, primaryAction, secondaryActions } = props;
  const toolsSlot = props.toolsSlot;
  /*
   * Э4: опасные пункты — в НИЗУ меню, отдельно от обычных. Порядок считает компонент, а не
   * каждый вызывающий: тот же приём, что у меню «…» строки таблицы (Э1).
   */
  const menuActions =
    secondaryActions?.length && secondaryActions.length > 1
      ? [...secondaryActions.filter((a) => !a.danger), ...secondaryActions.filter((a) => a.danger)]
      : undefined;
  const inlineSecondary = secondaryActions?.length === 1 ? secondaryActions[0] : undefined;

  return (
    <header className="ui-page-header">
      <div>
        {breadcrumbsSlot ?? null}
        <h1 className="ui-page-title">{title}</h1>
        {subtitle ? <p className="ui-page-subtitle">{subtitle}</p> : null}
      </div>
      {primaryAction || secondaryActions?.length || toolsSlot ? (
        <div className="ui-inline">
          {toolsSlot ?? null}
          {inlineSecondary ? renderSecondary(inlineSecondary) : null}
          {primaryAction ? renderPrimary(primaryAction) : null}
          {menuActions ? (
            <HeaderMenu summary="Ещё" summaryClassName="ui-button" summaryLabel="Ещё действия">
              {menuActions.map((action) => renderMenuItem(action))}
            </HeaderMenu>
          ) : null}
        </div>
      ) : null}
    </header>
  );
};
