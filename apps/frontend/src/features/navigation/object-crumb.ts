/**
 * Имя объекта для последней крошки (ТЗ «Стабилизация, UX и развитие», 3.5 / Н5).
 *
 * Крошки собираются в оболочке из адреса, а имя объекта («Группа 360px», «Иванов Иван
 * Иванович») знает только экран карточки — он его и загружает. Оболочке негде было взять это
 * имя, поэтому карточки заканчивались словом «Карточка», а вложенные адреса печатали сырые
 * идентификаторы: «Мои тесты / test_vc8sf4k5 / attempt / Карточка».
 *
 * Это хранилище — шов между ними: экран публикует имя (или честное «ещё грузится» / «не
 * найдено»), оболочка подписана и перерисовывает крошки. Реакт здесь не нужен: чистые функции
 * проверяются без монтирования, а хук-обёртка лежит рядом в `use-object-crumb.ts`.
 *
 * Запись привязана к адресу: имя, опубликованное карточкой А, не покажется на карточке Б в тот
 * миг, пока Б ещё грузится, — даже если размонтирование А запоздает.
 */

export type ObjectCrumb =
  | { status: 'loading' }
  | { status: 'ready'; name: string }
  | { status: 'missing' }
  | { status: 'failed' };

export type PublishedObjectCrumb = { pathname: string; crumb: ObjectCrumb };

let published: PublishedObjectCrumb | null = null;
const listeners = new Set<() => void>();

const notify = (): void => {
  for (const listener of listeners) listener();
};

export const publishObjectCrumb = (pathname: string, crumb: ObjectCrumb): void => {
  const current = published;
  if (
    current &&
    current.pathname === pathname &&
    current.crumb.status === crumb.status &&
    (crumb.status !== 'ready' ||
      current.crumb.status !== 'ready' ||
      current.crumb.name === crumb.name)
  ) {
    return; // то же самое — подписчиков не дёргаем, иначе перерисовка по кругу
  }
  published = { pathname, crumb };
  notify();
};

/** Экран ушёл — его имя больше не действует. Чужую запись (другой адрес) не трогаем. */
export const retractObjectCrumb = (pathname: string): void => {
  if (published?.pathname !== pathname) return;
  published = null;
  notify();
};

export const subscribeObjectCrumb = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Снимок для `useSyncExternalStore`: ссылка меняется только вместе с содержимым. */
export const getObjectCrumbSnapshot = (): PublishedObjectCrumb | null => published;

/** На сервере имени ещё нет — крошка объекта рисуется скелетоном, как и в первый миг в браузере. */
export const getObjectCrumbServerSnapshot = (): PublishedObjectCrumb | null => null;

/** Имя объекта для ЭТОГО адреса; запись с другого адреса — не наша. */
export const objectCrumbFor = (
  snapshot: PublishedObjectCrumb | null,
  pathname: string
): ObjectCrumb | null => (snapshot && snapshot.pathname === pathname ? snapshot.crumb : null);
