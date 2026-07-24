import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Страж изоляции тенантов на уровне контроллеров (ФТ-D1.3, ТЗ «Арендная СДО» Фаза 0).
 *
 * Инвариант: каждый доменный HTTP-контроллер обязан проходить через `TenantGuard`
 * (`@UseGuards(TenantGuard, …)`). Иначе запрос не привязан к тенанту — это межтенантная
 * дыра. Тест роняется, как только появляется новый контроллер без tenant-скоупа и без
 * ОСОЗНАННОГО попадания в белый список публичных/внутренних.
 *
 * Почему файловый скан, а не boot приложения: полный граф модулей требует инфраструктуры
 * (Postgres/Redis/RabbitMQ), а HTTP-integration тесты бутстрапят СТАБ-контроллер, минуя
 * реальный граф модулей. Эта дыра закрывается статически — тот же приём, что в
 * common/permission-guard-module-wiring.test.ts.
 */

const MODULES = resolve(dirname(fileURLToPath(import.meta.url)), '../../modules');

/**
 * Публичные / внутренние контроллеры БЕЗ TenantGuard — у каждого своя защита.
 * Пополнять только с обоснованием: почему привязка к тенанту не нужна.
 */
const PUBLIC_CONTROLLERS: ReadonlyArray<{ file: string; why: string }> = [
  { file: 'health/health.controller.ts', why: 'liveness/readiness без тенанта' },
  {
    file: 'payments/payments-webhook.controller.ts',
    why: 'внешний вебхук провайдера; аутентичность — проверка подписи/re-fetch адаптера, тенант резолвится по provider_payment_id'
  },
  {
    file: 'communication/webinars-webhook.controller.ts',
    why: 'внешний вебхук провайдера; проверка подписи внутри адаптера, тенант — по provider_session_id'
  },
  {
    file: 'mvp/mvp-internal-worker.controller.ts',
    why: 'внутренние callback-и worker; защищены собственным WorkerCallbackGuard'
  },
  {
    file: 'documents/public-verify.controller.ts',
    why: 'публичная проверка документа по QR (ФТ-A6) — без auth по задумке; ПДн отдаются частично, перебор ограничивается rate limit (ФТ-G2)'
  },
  {
    file: 'migration/backfill/backfill.controller.ts',
    why: 'платформенная сверка СКВОЗЬ тенанты (умышленно cross-tenant); защищён WorkerCallbackGuard'
  },
  {
    file: 'mvp/scorm/scorm-content.controller.ts',
    why: 'раздача SCORM в iframe (заголовки слать нельзя); доступ — HMAC-токен в URL, tenantId берётся из подписанного payload, ключ S3 привязан к тенанту'
  }
];

function listControllers(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...listControllers(p));
    else if (entry.endsWith('.controller.ts') && !entry.includes('.test.')) out.push(p);
  }
  return out;
}

/** true, если в файле есть `@UseGuards(…)` со ссылкой на TenantGuard (многострочный вызов тоже). */
function usesTenantGuard(src: string): boolean {
  return /@UseGuards\(\s*[^)]*\bTenantGuard\b/s.test(src);
}

describe('Изоляция тенантов: каждый контроллер под TenantGuard (ФТ-D1.3)', () => {
  const controllers = listControllers(MODULES);

  it('в проекте есть контроллеры для проверки (скан не пустой)', () => {
    expect(controllers.length).toBeGreaterThan(0);
  });

  it('белый список ссылается только на существующие публичные контроллеры без TenantGuard', () => {
    for (const { file } of PUBLIC_CONTROLLERS) {
      const src = readFileSync(join(MODULES, file), 'utf8'); // бросит, если файл переименован/удалён
      expect(
        usesTenantGuard(src),
        `${file} в белом списке, но уже под TenantGuard — убрать из PUBLIC_CONTROLLERS`
      ).toBe(false);
    }
  });

  it('каждый доменный контроллер защищён TenantGuard или явно в белом списке', () => {
    const allow = new Set(PUBLIC_CONTROLLERS.map((c) => resolve(join(MODULES, c.file))));
    const offenders: string[] = [];
    for (const file of controllers) {
      if (allow.has(resolve(file))) continue;
      if (!usesTenantGuard(readFileSync(file, 'utf8'))) {
        offenders.push(file.slice(file.indexOf('modules/')));
      }
    }
    expect(
      offenders,
      `Эти контроллеры не проходят через TenantGuard и не в белом списке — запрос не привязан ` +
        `к тенанту (межтенантная дыра). Добавь @UseGuards(TenantGuard, …); либо, если контроллер ` +
        `осознанно публичный, внеси его в PUBLIC_CONTROLLERS с обоснованием:\n${offenders.join('\n')}`
    ).toEqual([]);
  });
});
