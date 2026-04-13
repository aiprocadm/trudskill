import { navigationModel } from './model';

const hrefToLabel = new Map(navigationModel.map((item) => [item.href, item.label]));

/** Подписи сегментов, если нет точного совпадения с пунктом меню. */
const segmentLabels: Record<string, string> = {
  new: 'Создание',
  learner: 'Слушатель',
  courses: 'Курсы',
  requisites: 'Реквизиты',
  commission: 'Комиссия',
  deals: 'Сделки',
  applications: 'Заявки',
  processes: 'Процессы',
  'legal-log': 'Юридический журнал',
  exports: 'Экспорты',
  'sync-logs': 'Журнал синхронизации',
  integrations: 'Интеграции',
  notifications: 'Уведомления',
  documents: 'Документы',
  materials: 'Материалы',
  groups: 'Группы',
  directions: 'Направления',
  users: 'Пользователи',
  counterparties: 'Контрагенты',
  settings: 'Настройки',
  audit: 'Аудит',
  registry: 'Реестр',
  reports: 'Отчёты',
  webinars: 'Вебинары',
  assessment: 'Аттестация',
  'question-import': 'Импорт вопросов',
  'gov-export': 'Гос. выгрузки',
  workspace: 'Рабочее место',
  chat: 'Чат',
  mailings: 'Рассылки',
  telephony: 'Телефония',
  proctoring: 'Прокторинг',
  scorm: 'SCORM',
  forms: 'Формы',
  module: 'Модуль',
  'module-empty': 'Пустой модуль',
  esign: 'НЭП',
  learners: 'Слушатели',
  crm: 'CRM'
};

const looksLikeId = (segment: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment) ||
  /^c[a-z0-9]{24,}$/i.test(segment) ||
  (/^[a-z0-9_-]{20,}$/i.test(segment) && segment.includes('-'));

const labelForSegment = (segment: string, isLast: boolean): string => {
  if (segmentLabels[segment]) return segmentLabels[segment];
  if (isLast && looksLikeId(segment)) return 'Карточка';
  return segment;
};

export type BreadcrumbItem = { label: string; href: string };

export const buildBreadcrumbs = (pathname: string): BreadcrumbItem[] => {
  const normalized = (pathname.split('?')[0] ?? '/').replace(/\/+$/, '') || '/';
  if (normalized === '/') {
    return [{ label: 'Главная', href: '/' }];
  }

  const segments = normalized.split('/').filter(Boolean);
  const items: BreadcrumbItem[] = [{ label: 'Главная', href: '/' }];

  let acc = '';
  for (let i = 0; i < segments.length; i++) {
    acc += `/${segments[i]}`;
    const fromNav = hrefToLabel.get(acc);
    const isLast = i === segments.length - 1;
    const label = fromNav ?? labelForSegment(segments[i] ?? '', isLast);
    items.push({ label, href: acc });
  }

  return items;
};
