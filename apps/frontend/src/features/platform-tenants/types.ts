/**
 * ФТ-D2.2 (Фаза 4 Task 3, срез 3): платформенная админка тенантов.
 *
 * Статусы жизненного цикла зафиксированы на сервере CHECK-ограничением (0072) —
 * этот список обязан совпадать с `TENANT_STATUSES` бэкенда.
 */

export const ALL_TENANT_STATUSES = ['trial', 'active', 'suspended', 'archived'] as const;

export type PlatformTenantStatus = (typeof ALL_TENANT_STATUSES)[number];

export const TENANT_STATUS_LABELS: Record<PlatformTenantStatus, string> = {
  trial: 'Пробный',
  active: 'Действующий',
  suspended: 'Приостановлен',
  archived: 'В архиве'
};

export const TENANT_STATUS_TONES: Record<
  PlatformTenantStatus,
  'info' | 'success' | 'warning' | 'neutral'
> = {
  trial: 'info',
  active: 'success',
  suspended: 'warning',
  archived: 'neutral'
};

export interface PlatformTenantDto {
  id: string;
  code: string;
  name: string;
  status: PlatformTenantStatus;
  /**
   * Назначенный тариф. `null` — тариф не назначен, лимитов нет (журнал 87).
   * Раньше поля не было вовсе: тариф назначали на этом экране, а увидеть назначенное
   * было негде.
   */
  planName?: string | null;
}

/**
 * Куда можно перевести тенанта из текущего статуса. Сервер разрешает любые переходы
 * (кроме мусорных значений); UI сужает их до осмысленных, чтобы не подсовывать
 * админу «архив → пробный» как равноправный вариант: возврат из архива — только
 * в приостановленные, дальше по цепочке.
 */
export const nextStatusOptions = (current: PlatformTenantStatus): PlatformTenantStatus[] => {
  switch (current) {
    case 'trial':
      return ['active', 'suspended', 'archived'];
    case 'active':
      return ['suspended', 'archived'];
    case 'suspended':
      return ['active', 'archived'];
    case 'archived':
      return ['suspended'];
    default:
      return [];
  }
};

/** Вход «от имени» разрешён сервером во все статусы, кроме архива (офбординг). */
export const canImpersonate = (status: PlatformTenantStatus): boolean => status !== 'archived';
