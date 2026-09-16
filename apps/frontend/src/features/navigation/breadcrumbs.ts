import { navigationModel } from './model';
import { resolveGroupForPath } from './nav-groups';

const hrefToLabel = new Map(navigationModel.map((item) => [item.href, item.label]));

/**
 * Подписи сегментов, у которых НЕТ пункта меню, — только они.
 *
 * ТЗ 3.4 (Н3). Раньше здесь лежал второй словарь имён разделов, и он спорил с меню: `audit` →
 * «Аудит» при заголовке «Журнал действий», `assessment` → «Аттестация» при «Оценивании»,
 * `workspace` → «Рабочее место» при «Оперативной панели», `gov-export` → «Гос. выгрузки» при
 * «Госвыгрузках». Для точного адреса побеждала подпись меню, и словарь молчал — но стоило
 * адресу оказаться вложенным, крошки называли раздел третьим словом. Одно имя на раздел живёт
 * в `navigationModel`; сторож `one-section-one-name` не даёт завести здесь ключ, у которого есть
 * пункт меню.
 */
const segmentLabels: Record<string, string> = {
  new: 'Создание',
  deals: 'Сделки',
  applications: 'Заявки',
  processes: 'Процессы',
  /*
   * §5.433: «Компании» — решение владельца от 14.08.2026 (IA-017): `/counterparties`
   * перенаправляет на `/admin/clients`, и раздел в меню называется «Компании». Хлебные
   * крошки говорили «Контрагенты», то есть третьим словом об одной и той же сущности.
   */
  counterparties: 'Компании',
  /* ТЗ 3.4: хаб `/academy` слит с настройками; сегмент остался у вложенных адресов. */
  academy: 'Настройки',
  registry: 'Реестр',
  mailings: 'Рассылки',
  forms: 'Формы',
  module: 'Модуль',
  'module-empty': 'Пустой модуль',
  esign: 'НЭП',
  crm: 'CRM',
  learning: 'Обучение',
  platform: 'Платформа'
};

const looksLikeId = (segment: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment) ||
  /^c[a-z0-9]{24,}$/i.test(segment) ||
  (/^[a-z0-9_-]{20,}$/i.test(segment) && segment.includes('-')) ||
  // Родной формат идентификаторов системы: `learner_89ydse8s`, `group_9z34wx1b` и т.п.
  // Без этой ветки крошка показывала сырой id вместо «Карточка».
  /^[a-z]+(?:_[a-z0-9]+)+$/i.test(segment);

const labelForSegment = (segment: string, isLast: boolean): string => {
  if (segmentLabels[segment]) return segmentLabels[segment];
  if (isLast && looksLikeId(segment)) return 'Карточка';
  return segment;
};

export type BreadcrumbItem = { label: string; href?: string };

export const buildBreadcrumbs = (pathname: string): BreadcrumbItem[] => {
  const normalized = (pathname.split('?')[0] ?? '/').replace(/\/+$/, '') || '/';
  if (normalized === '/') {
    return [{ label: 'Главная', href: '/' }];
  }

  const items: BreadcrumbItem[] = [{ label: 'Главная', href: '/' }];

  // Крошка блока (раздел меню) — ненавигационная: Блок → Страница → Деталь.
  const group = resolveGroupForPath(normalized);
  if (group) {
    items.push({ label: group.label });
  }

  const segments = normalized.split('/').filter(Boolean);
  let acc = '';
  for (let i = 0; i < segments.length; i++) {
    acc += `/${segments[i]}`;
    const fromNav = hrefToLabel.get(acc);
    const isLast = i === segments.length - 1;
    // Служебный сегмент адреса (`/admin/...`): самостоятельной страницы за ним нет,
    // а в крошках он печатался сырым словом «admin» между русскими подписями.
    if (!fromNav && !isLast && segments[i] === 'admin') continue;
    const label = fromNav ?? labelForSegment(segments[i] ?? '', isLast);
    items.push({ label, href: acc });
  }

  return items;
};
