import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Ревизия 2026-08-26 (порция 21) — сторож стыка состояния документов.
 *
 * Состояние документов — request-scoped: на каждый запрос это ПУСТЫЕ массивы,
 * которые наполняет только `DocumentsRequestPersistenceInterceptor` (и сохраняет
 * после обработчика). Контроллер, чей сервис ходит в `DocumentsService`, но не
 * несёт перехватчик, молча работает с пустым, никогда не сохраняемым состоянием:
 * кабинеты пусты, «одна кнопка» падает «Template not found», выгрузка в госреестр
 * уходит с пустым номером протокола. Ровно это уже случилось с шестью
 * контроллерами (mvp, close-group-chain, ot-registry, frdo-registry, esign) —
 * сторож не даёт завести седьмой.
 *
 * Правило: если сам контроллер или любой инжектируемый им сервис (по относительным
 * импортам `*.service.js`, в один шаг) импортирует `documents.service`, контроллер
 * обязан упоминать одно из трёх:
 *  - `DocumentsRequestPersistenceInterceptor` — штатный путь для HTTP-маршрутов;
 *  - `DocumentsTenantRunner` — явные load→fn→save вне HTTP-персистенса (worker);
 *  - `DOCUMENTS_PERSISTENCE_BACKEND` — прямое чтение durable-хранилища
 *    (публичная QR-проверка: у неё нет tenant-контекста).
 * Осознанные отклонения — только через реестр исключений с причиной.
 *
 * Ограничение (записано честно): у `MvpController` перехватчик стоит на конкретных
 * маршрутах, а не на классе — «упоминает» не доказывает, что покрыт КАЖДЫЙ маршрут,
 * читающий документы. Полноту стыка держит HTTP-тест с настоящим `DocumentsService`
 * в `mvp.domains.http.integration.test.ts`.
 */

// Корень от файла теста, НЕ от process.cwd(): у фронта/бэка два штатных способа
// запуска с разным cwd (см. CLAUDE.md и урок сторожей §5.291).
const MODULES_ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');

/** Осознанные исключения: путь от src/modules (разделители — всегда «/»). */
const EXCEPTIONS: Record<string, string> = {
  // Трое ниже инжектируют MvpService (он ходит в документы), но зовут только методы
  // слушателей/уведомлений: getLinkedLearnerForUser, get/setNotificationStaffRecipients.
  // Документные маршруты MVP живут в mvp.controller.ts и несут перехватчик на себе.
  'mvp/consents/consent.controller.ts':
    'MvpService только ради getLinkedLearnerForUser — документы не читает',
  'mvp/esia/esia.controller.ts':
    'MvpService только ради getLinkedLearnerForUser — документы не читает',
  'mvp/notification-recipients.controller.ts':
    'MvpService только ради адресатов уведомлений — документы не читает'
};

const walk = (dir: string): string[] => {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (name.endsWith('.controller.ts') && !name.includes('.test.')) {
      out.push(full);
    }
  }
  return out;
};

const relModulePath = (file: string): string =>
  file.slice(MODULES_ROOT.length + 1).replace(/\\/g, '/');

const importsDocumentsService = (text: string): boolean =>
  /import\s+[^;]*\bDocumentsService\b[^;]*from\s+['"][^'"]*documents\.service(?:\.js)?['"]/.test(
    text
  );

/** Относительные импорты сервисов контроллера → их файлы (один шаг вглубь). */
const injectedServiceFiles = (controllerFile: string, text: string): string[] => {
  const files: string[] = [];
  const importRe = /import\s+[^;]*from\s+['"](\.[^'"]+\.service)\.js['"]/g;
  for (const match of text.matchAll(importRe)) {
    const candidate = resolve(dirname(controllerFile), `${match[1]}.ts`);
    if (existsSync(candidate)) files.push(candidate);
  }
  return files;
};

describe('documents-state-wiring guard', () => {
  const controllers = walk(MODULES_ROOT);

  it('находит контроллеры (сканер не смотрит в пустоту)', () => {
    expect(controllers.length).toBeGreaterThan(10);
  });

  it('каждый контроллер, чей сервис ходит в DocumentsService, несёт перехватчик документов', () => {
    const violations: string[] = [];
    const touching: string[] = [];

    for (const file of controllers) {
      const text = readFileSync(file, 'utf8');
      const touchesDirectly = importsDocumentsService(text);
      const touchesViaService = injectedServiceFiles(file, text).some((svc) =>
        importsDocumentsService(readFileSync(svc, 'utf8'))
      );
      if (!touchesDirectly && !touchesViaService) continue;

      const rel = relModulePath(file);
      touching.push(rel);
      const wired =
        text.includes('DocumentsRequestPersistenceInterceptor') ||
        text.includes('DocumentsTenantRunner') ||
        text.includes('DOCUMENTS_PERSISTENCE_BACKEND');
      if (!wired && !(rel in EXCEPTIONS)) {
        violations.push(rel);
      }
    }

    expect(
      violations,
      [
        'Контроллеры работают с DocumentsService без загрузки его состояния:',
        ...violations,
        'Состояние документов request-scoped и ПУСТОЕ, пока его не загрузит',
        'DocumentsRequestPersistenceInterceptor (или явный DocumentsTenantRunner).',
        'Повесьте перехватчик на маршруты, читающие документы, либо внесите контроллер',
        'в EXCEPTIONS этого файла с причиной.'
      ].join('\n')
    ).toEqual([]);

    // Сканер должен видеть известных потребителей — иначе он зелёный, потому что слеп.
    for (const known of [
      'mvp/mvp.controller.ts',
      'mvp/close-group-chain.controller.ts',
      'mvp/ot-registry/ot-registry.controller.ts',
      'mvp/frdo-registry/frdo-registry.controller.ts',
      'esign/esign.controller.ts',
      'documents/documents.controller.ts',
      'documents/documents-internal-worker.controller.ts'
    ]) {
      expect(touching, `сканер потерял известного потребителя документов: ${known}`).toContain(
        known
      );
    }
  });

  it('реестр исключений не протух', () => {
    for (const rel of Object.keys(EXCEPTIONS)) {
      const full = join(MODULES_ROOT, rel);
      expect(existsSync(full), `исключение ссылается на несуществующий файл: ${rel}`).toBe(true);
    }
  });
});
