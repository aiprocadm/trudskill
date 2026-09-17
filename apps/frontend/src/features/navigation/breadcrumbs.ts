import { navigationModel } from './model';
import { resolveGroupForPath } from './nav-groups';
import { type ObjectCrumb } from './object-crumb';

const hrefToLabel = new Map(navigationModel.map((item) => [item.href, item.label]));

/**
 * Страницы БЕЗ пункта меню — единственные, чьё имя крошки берут не из меню.
 *
 * ТЗ 3.5 (Н5). Ключ — адрес целиком, а не слово-сегмент. Прежний словарь был по сегментам, и
 * `new` называлось «Создание» сразу для двух разных страниц — «Создание курса» и «Новая
 * группа»; а сегменты без своей страницы (`esign`, `crm`, `platform`, `learning`) получали
 * подпись и становились ссылкой в никуда. Имя здесь равно заголовку страницы — это держит
 * сторож `breadcrumbs-name-the-object`; ключ с пунктом меню запрещён сторожем
 * `one-section-one-name` (имя тогда берётся из меню, второго словаря быть не должно).
 */
export const pageLabels: Record<string, string> = {
  '/courses/new': 'Создание курса',
  '/groups/new': 'Новая группа',
  '/crm/deals': 'Сделки',
  '/forms': 'Системные формы',
  '/mailings': 'Рассылки и уведомления',
  '/module-empty': 'Раздел в разработке',
  '/admin/ui-kit': 'Витрина шаблонов (UI Kit)'
};

/** Корень кабинета слушателя: под ним своя иерархия, блоки администратора не показываются. */
export const CABINET_ROOT = '/learner';

/** Подписи крошки объекта, когда имени с сервера нет и не будет. */
export const OBJECT_CRUMB_MISSING = 'Не найдено';
export const OBJECT_CRUMB_FAILED = 'Не удалось загрузить';

export const looksLikeId = (segment: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment) ||
  /^c[a-z0-9]{24,}$/i.test(segment) ||
  (/^[a-z0-9_-]{20,}$/i.test(segment) && segment.includes('-')) ||
  // Родной формат идентификаторов системы: `learner_89ydse8s`, `group_9z34wx1b` и т.п.
  /^[a-z]+(?:_[a-z0-9]+)+$/i.test(segment);

export type BreadcrumbItem = {
  label: string;
  href?: string;
  /** Имя объекта ещё едет с сервера — оболочка рисует скелетон вместо текста. */
  pending?: boolean;
  /** Крошка объекта (карточка), а не раздела: заголовок вкладки ставит перед ней раздел (ТЗ 4.3). */
  object?: true;
};

const objectCrumb = (object: ObjectCrumb | null, href: string): BreadcrumbItem => {
  switch (object?.status) {
    case 'ready':
      return { label: object.name, href, object: true };
    case 'missing':
      return { label: OBJECT_CRUMB_MISSING, href, object: true };
    case 'failed':
      return { label: OBJECT_CRUMB_FAILED, href, object: true };
    default:
      return { label: '', href, pending: true, object: true };
  }
};

/**
 * Крошки: Блок → Раздел → Имя объекта.
 *
 * - «Главной» нет: `/` — диспетчер входа (ТЗ 3.4 объявил его служебным), а у слушателя он вёл
 *   в «Мой кабинет», и получалось два имени одного места подряд.
 * - Блок (подпись без ссылки) — только вне кабинета слушателя: там своя иерархия от «Мой
 *   кабинет», а не «Документы и удостоверения / Мой кабинет / Мои документы».
 * - Крошка ставится только за сегмент, за которым есть страница: пункт меню или `pageLabels`.
 *   Служебные слова адреса (`admin`, `attempt`, `platform`, `submit`, `result`) пропускаются —
 *   раньше они печатались сырыми между русскими подписями.
 * - Все идентификаторы адреса сворачиваются в ОДНУ крошку объекта: имя даёт экран карточки
 *   через `useObjectCrumb`, до этого — скелетон.
 */
export const buildBreadcrumbs = (
  pathname: string,
  object: ObjectCrumb | null = null
): BreadcrumbItem[] => {
  const normalized = (pathname.split('?')[0] ?? '/').replace(/\/+$/, '') || '/';
  if (normalized === '/') return [];

  const items: BreadcrumbItem[] = [];
  const inCabinet = normalized === CABINET_ROOT || normalized.startsWith(`${CABINET_ROOT}/`);
  const group = inCabinet ? null : resolveGroupForPath(normalized);
  if (group) items.push({ label: group.label });

  let acc = '';
  let isCard = false;
  for (const segment of normalized.split('/').filter(Boolean)) {
    acc += `/${segment}`;
    const label = hrefToLabel.get(acc) ?? pageLabels[acc];
    if (label !== undefined) {
      items.push({ label, href: acc });
      continue;
    }
    if (looksLikeId(segment)) isCard = true;
  }
  if (isCard) items.push(objectCrumb(object, normalized));

  return items;
};
