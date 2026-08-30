import { Inject, Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../infrastructure/database/database.service.js';
import { TenantService } from '../../tenant/tenant.service.js';

/**
 * Учёт занятого места per tenant (ФТ-B1.3, Фаза 2 Task 3).
 *
 * Зачем: это фундамент тарифов аренды (ФТ-D4) — без счётчика «сколько занимает учебный
 * центр» лимиты хранилища нечем сделать статьёй тарифа. Плюс практическая защита:
 * методист не должен узнавать о переполнении после часа заливки четырёхгигабайтного ролика.
 *
 * **Двойной учёт — главная ловушка этого счётчика.** Видео в self-hosted-ветке имеет
 * ОДНОВРЕМЕННО строку в `learning.video_assets` и строку в `storage.files` (мы регистрируем
 * файл ради AV-гейта, Task 2). Простая сумма двух таблиц завысила бы занятое место ровно
 * вдвое по всем видео. Поэтому из `storage.files` вычитаются файлы, на которые ссылаются
 * ассеты.
 *
 * Видео у провайдера (`file_id is null`) в нашем хранилище не лежит, но место у провайдера
 * тоже оплачивается — поэтому в счётчик оно входит.
 */

/** Ключ в `payload` настроек тенанта. Нет ключа = лимита нет. */
export const STORAGE_LIMIT_SETTINGS_KEY = 'storageLimitBytes';

export interface TenantStorageUsage {
  usedBytes: number;
  /** `null` = лимит не задан (безлимит) — так живут все существующие тенанты. */
  limitBytes: number | null;
  /** `null` при безлимите. Никогда не отрицательный: «минус 3 ГБ» пользователю ни о чём не говорит. */
  remainingBytes: number | null;
}

/** Человекочитаемый размер: пользователю нужны гигабайты, а не 4294967296. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} ГБ`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} МБ`;
  return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
}

@Injectable()
export class TenantStorageService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(TenantService) private readonly tenants: TenantService
  ) {}

  async getUsage(tenantId: string): Promise<TenantStorageUsage> {
    const [usedBytes, limitBytes] = await Promise.all([
      this.usedBytes(tenantId),
      this.limitBytes(tenantId)
    ]);
    return {
      usedBytes,
      limitBytes,
      remainingBytes: limitBytes === null ? null : Math.max(0, limitBytes - usedBytes)
    };
  }

  /**
   * Проверка перед созданием ассета. Бросает 400 с текстом «занято X из Y», а не молчаливый
   * отказ хранилища на середине заливки.
   */
  async assertFits(tenantId: string, additionalBytes: number): Promise<TenantStorageUsage> {
    const usage = await this.getUsage(tenantId);
    if (usage.limitBytes === null) return usage;
    if (usage.usedBytes + additionalBytes > usage.limitBytes) {
      throw new StorageLimitExceededError(usage, additionalBytes);
    }
    return usage;
  }

  private async usedBytes(tenantId: string): Promise<number> {
    // Ассеты в терминальном `failed` места не занимают: файла либо нет, либо он битый
    // и подлежит удалению — держать его в счётчике значит наказывать за чужой сбой.
    const rows = await this.db.query<{ used: string | null }>(
      `select (
         coalesce((
           select sum(size_bytes) from learning.video_assets
           where tenant_id = $1 and status in ('uploading', 'processing', 'ready')
         ), 0)
         + coalesce((
           select sum(f.size_bytes) from storage.files f
           where f.tenant_id = $1
             and f.deleted_at is null
             -- Файл, на который ссылается ассет, уже посчитан выше: без этого условия
             -- каждое self-hosted видео учитывалось бы дважды.
             and not exists (
               select 1 from learning.video_assets v
               where v.tenant_id = $1 and v.file_id = f.id
             )
         ), 0)
       )::text as used`,
      [tenantId]
    );
    return Number(rows[0]?.used ?? 0);
  }

  /**
   * Действующий лимит места (журнал 307).
   *
   * Раньше здесь читался ТОЛЬКО ручной ключ настроек, а экран использования показывал лимит
   * ТАРИФА (`plan.storageLimitBytes ?? ручной ключ`). Получались два разных числа про одно и
   * то же: центру показывали 1 ГБ по тарифу, а заливку ограничивал ручной ключ — или не
   * ограничивал вовсе, если ключа не было. Порядок теперь ОДИН и тот же в обоих местах:
   * сначала тариф, потом ручной ключ как наследие «до тарифов».
   */
  private async limitBytes(tenantId: string): Promise<number | null> {
    const planLimit = await this.planStorageLimit(tenantId);
    if (planLimit !== null) return planLimit;
    // Нет настроек у тенанта — значит и лимита нет; это не повод падать.
    const settings = await this.tenants.getSettings(tenantId).catch(() => undefined);
    const raw = settings?.payload?.[STORAGE_LIMIT_SETTINGS_KEY];
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return null;
    return raw;
  }

  /** Лимит места из действующей подписки центра. Нет тарифа — `null`, решает ручной ключ. */
  private async planStorageLimit(tenantId: string): Promise<number | null> {
    const rows = await this.db
      .query<{ storageLimitBytes: number | string | null }>(
        `select p.storage_limit_bytes as "storageLimitBytes"
           from core.plans p
           join core.tenant_subscriptions s on s.plan_id = p.id
          where s.tenant_id = $1 and s.status = 'active'
          limit 1`,
        [tenantId]
      )
      .catch(() => []);
    const raw = rows[0]?.storageLimitBytes;
    if (raw === null || raw === undefined) return null;
    // pg отдаёт bigint СТРОКОЙ — та же грабля, что при разборе тарифов платформы.
    const limit = Number(raw);
    return Number.isFinite(limit) && limit > 0 ? limit : null;
  }
}

/** Отдельный класс, чтобы вызывающий слой сам решил, каким HTTP-кодом это отдать. */
export class StorageLimitExceededError extends Error {
  constructor(
    readonly usage: TenantStorageUsage,
    readonly requestedBytes: number
  ) {
    super(
      `Не хватает места в хранилище: занято ${formatBytes(usage.usedBytes)} из ` +
        `${formatBytes(usage.limitBytes ?? 0)}, файлу нужно ещё ${formatBytes(requestedBytes)}`
    );
    this.name = 'StorageLimitExceededError';
  }
}
