/**
 * ФТ-D3.2 (Фаза 4 Task 8): определение арендатора по адресу сайта.
 *
 * Решение по вопросу №5 (владелец делегировал): код резолва пишется сразу, базовый домен
 * берётся из переменной окружения. DNS-запись и wildcard-сертификат — инфраструктурная
 * часть за владельцем; без них код просто не встретит поддоменов и работает как раньше.
 *
 * Чистая функция: адрес → решение. Никаких обращений к сети — middleware и тесты
 * используют одну и ту же логику.
 */

export type TenantHostResolution =
  /** Поддомен арендатора: `demo.lms.example.ru` при базовом `lms.example.ru`. */
  | { kind: 'tenant'; code: string }
  /** Сам базовый домен или локальная разработка — арендатор берётся из настроек. */
  | { kind: 'base' }
  /** Чужой домен: обслуживать его мы не подписывались. */
  | { kind: 'foreign' };

/** Код арендатора — та же маска, что в DTO создания тенанта на сервере. */
const TENANT_CODE_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/** Адреса, на которых поддоменов не бывает: локальная разработка и прямой заход по IP. */
const isLocalHost = (hostname: string): boolean =>
  hostname === 'localhost' ||
  hostname === '127.0.0.1' ||
  hostname === '::1' ||
  /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);

/** Отрезает порт и приводит к нижнему регистру: `Demo.LMS.ru:3000` → `demo.lms.ru`. */
export const normalizeHost = (host: string | null | undefined): string => {
  if (!host) return '';
  const withoutPort = host.trim().toLowerCase().replace(/:\d+$/, '');
  // IPv6 в Host приходит в скобках — скобки не часть имени.
  return withoutPort.replace(/^\[|\]$/g, '');
};

export const resolveTenantHost = (
  host: string | null | undefined,
  baseDomain: string | null | undefined
): TenantHostResolution => {
  const hostname = normalizeHost(host);
  const base = normalizeHost(baseDomain);

  // Базовый домен не настроен — режим «один арендатор», как было до поддоменов.
  if (!base) return { kind: 'base' };
  if (!hostname || isLocalHost(hostname)) return { kind: 'base' };
  if (hostname === base) return { kind: 'base' };
  // `www` — это витрина платформы, а не арендатор с кодом «www».
  if (hostname === `www.${base}`) return { kind: 'base' };

  if (!hostname.endsWith(`.${base}`)) return { kind: 'foreign' };

  const label = hostname.slice(0, -(base.length + 1));
  // Многоуровневые поддомены (`a.b.lms.ru`) не наши: код арендатора — ровно одна метка.
  if (label.includes('.')) return { kind: 'foreign' };
  if (!TENANT_CODE_PATTERN.test(label)) return { kind: 'foreign' };

  return { kind: 'tenant', code: label };
};

/**
 * Имя cookie с кодом арендатора: ставит middleware, читает клиентский код.
 *
 * BR-020/BR-022 — выкатка N периода двойного чтения: пишем всегда новое имя, читаем
 * новое → при отсутствии старое, при удалении гасим оба.
 */
export const TENANT_CODE_COOKIE = 'trudskill_tenant_code';
/** Прежнее имя — только на период двойного чтения (60 дней). */
export const LEGACY_TENANT_CODE_COOKIE = 'cdoprof_tenant_code';
