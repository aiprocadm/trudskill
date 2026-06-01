# ОТ-реестр: provisional-шаблоны + XML-сериализация — Implementation Plan

> ✅ **РЕАЛИЗОВАНО 2026-06-01** — все 5 задач (TDD red→green). Гейты: backend `ot-registry/` 29 тестов, frontend gov-export 10, `pnpm typecheck` 8/8, ESLint clean. Незакоммичено (ожидает решения владельца). Handoff §5.101.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Владелец делегировал «придумать шаблоны самому». Добавляем настоящий **XML-сериализатор** (формат, который реестр реально импортирует — XSD 1.0.3), даём выбор формата выгрузки `xlsx|xml`, и **явно помечаем все артефакты как provisional** (комментарии в коде + баннер в UI), чтобы перед боевой отправкой их можно было сверить с эталоном ЛКОТ заменой одной константы.

**Architecture:** Регулятор-специфика остаётся в одной точке-swap'е на артефакт (`COLUMNS` для .xlsx, новый `ELEMENTS` для XML, `RESPONSE_COLUMNS` для ответа). Новый `OtRegistryXmlWriter` питается из того же `OtRegistryRow`, что и существующий `OtRegistryXlsxWriter` — сбор данных, preflight, round-trip не меняются. Сервис выбирает writer по полю `format` (default `xlsx`), сохраняет файл с правильным расширением/типом, пишет `batch.format`.

**Tech Stack:** NestJS (request-scoped service), TypeScript, exceljs (.xlsx), ручная XML-сериализация (без новых зависимостей), Vitest, Next.js App Router (frontend).

**Deviations from spec §16 (зафиксированы по доказательствам):**

- **ФИО оставляем комбинированным** (`OtRegistryRow.fullName`). Публично подтверждённое поле реестра — «ФИО»; раздельные Фамилия/Имя/Отчество — это структура, которую нельзя обосновать без эталона, поэтому не выдумываем. При сверке с эталоном — тривиальная замена в `COLUMNS`/`ELEMENTS`.
- **Миграцию `0045` НЕ трогаем** (исторический файл, слит в main; CLAUDE.md запрещает правку). 5 программ классификатора уже корректны по ПП №2464. Provisional-оговорка про `registry_id` фиксируется в доке (handoff/spec), не в коде.
- **Колонку «статус» в файле-ответе НЕ добавляем** (парсер уже устойчив; выдумывать колонку = ложная точность). `RESPONSE_COLUMNS` получает только provisional-комментарий.
- **Опция «выгрузка несданных» — вне scope** этого плана (спека §14, отдельный малый шаг).

**Commits (CLAUDE.md):** коммитим только по просьбе владельца. Шаги ниже показывают рекомендуемые точки коммита; при исполнении — держим изменения в рабочем дереве до явного «коммить».

**Branch:** `feat/2026-06-01-ot-registry-provisional-templates` (создана от `origin/main`).

---

### Task 1: Provisional-маркировка существующих артефактов (.xlsx + парсер ответа)

Комментарии-предупреждения в единственных точках маппинга. Поведение не меняется → теста нет, защита от «случайно приняли за эталон».

**Files:**

- Modify: `apps/backend/src/modules/mvp/ot-registry/ot-registry-xlsx.writer.ts:6`
- Modify: `apps/backend/src/modules/mvp/ot-registry/ot-registry-response.parser.ts:9`

- [ ] **Step 1: Усилить комментарий над `COLUMNS` в writer**

Заменить строку 6 (`// Единственное место маппинга поле→колонка. Сверить заголовки с офиц. шаблоном ЛКОТ (план §13 #1).`) на:

```ts
// PROVISIONAL — сверить с офиц. .xlsx-шаблоном ЛКОТ перед боевой отправкой (spec §13/§16).
// Единственное место маппинга поле→колонка (single swap point). Состав полей подтверждён
// публично (ФИО/СНИЛС/должность/программа/дата/результат); порядок и заголовки — best-effort.
```

- [ ] **Step 2: Пометить `RESPONSE_COLUMNS` в парсере**

Заменить строку 9 (`// Сверить с реальным файлом-ответом (план §13 #2): индексы колонок 1..4.`) на:

```ts
// PROVISIONAL — сверить с реальным файлом-ответом реестра (spec §13/§16). Единственное место
// маппинга колонка→поле. Парсер устойчив к минорным вариациям (пропуск строк без СНИЛС/рег.номера).
```

- [ ] **Step 3: Проверить компиляцию**

Run: `pnpm --filter @cdoprof/backend exec tsc -p tsconfig.json --noEmit`
Expected: PASS (комментарии не влияют на типы).

- [ ] **Step 4 (рекомендуемый коммит):**

```bash
git add apps/backend/src/modules/mvp/ot-registry/ot-registry-xlsx.writer.ts apps/backend/src/modules/mvp/ot-registry/ot-registry-response.parser.ts
git commit -m "docs(backend): mark ОТ-registry .xlsx/response mappings as provisional"
```

---

### Task 2: XML-сериализатор `OtRegistryXmlWriter` (+ golden-тест)

Канонический формат импорта реестра — XML по XSD 1.0.3. Новый writer, изолированный `ELEMENTS`, ручная сериализация с XML-экранированием, опциональные атрибуты организации.

**Files:**

- Create: `apps/backend/src/modules/mvp/ot-registry/ot-registry-xml.writer.ts`
- Test: `apps/backend/src/modules/mvp/ot-registry/ot-registry-xml.writer.test.ts`

- [ ] **Step 1: Написать падающий golden-тест**

Создать `apps/backend/src/modules/mvp/ot-registry/ot-registry-xml.writer.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { OtRegistryXmlWriter } from './ot-registry-xml.writer.js';

import type { OtRegistryRow } from '../mvp.types.js';

const row: OtRegistryRow = {
  enrollmentId: 'e1',
  learnerId: 'l1',
  fullName: 'Иванов Иван Иванович',
  snils: '112-233-445 95',
  position: 'Слесарь',
  employerInn: '7707083893',
  programCode: 'OT_A',
  programRegistryId: 1,
  programName: 'Программа А',
  protocolNumber: 'ПР-12/2026',
  knowledgeCheckDate: '10.03.2026',
  result: 'удовлетворительно'
};

describe('OtRegistryXmlWriter', () => {
  it('serializes a row to provisional XSD-1.0.3 XML, with org attrs when provided', () => {
    const xml = new OtRegistryXmlWriter()
      .build([row], { inn: '7707083893', registrationNumber: 'РН-1' })
      .toString('utf-8');
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('ВерсияФормата="1.0.3"');
    expect(xml).toContain('ИННОрганизации="7707083893"');
    expect(xml).toContain('РегНомерОрганизации="РН-1"');
    expect(xml).toContain('<СНИЛС>112-233-445 95</СНИЛС>');
    expect(xml).toContain('<ФИО>Иванов Иван Иванович</ФИО>');
    expect(xml).toContain('<ПрограммаОбучения Код="1">Программа А</ПрограммаОбучения>');
    expect(xml).toContain('<РезультатПроверкиЗнаний>удовлетворительно</РезультатПроверкиЗнаний>');
  });

  it('escapes XML-special chars and omits org attrs when org not provided', () => {
    const xml = new OtRegistryXmlWriter()
      .build([{ ...row, position: 'Мастер & K<>"' }])
      .toString('utf-8');
    expect(xml).toContain('<Должность>Мастер &amp; K&lt;&gt;&quot;</Должность>');
    expect(xml).not.toContain('ИННОрганизации=');
  });
});
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/ot-registry/ot-registry-xml.writer.test.ts --no-file-parallelism`
Expected: FAIL — `Cannot find module './ot-registry-xml.writer.js'`.

- [ ] **Step 3: Реализовать writer**

Создать `apps/backend/src/modules/mvp/ot-registry/ot-registry-xml.writer.ts`:

```ts
import { Injectable } from '@nestjs/common';

import type { OtRegistryRow } from '../mvp.types.js';

/**
 * PROVISIONAL — сверить имена элементов/атрибутов и пространство имён с офиц. XSD-схемой
 * ЛКОТ версии 1.0.3 перед боевой отправкой (spec §13/§16). Канонический формат импорта
 * реестра — XML по XSD 1.0.3; .xlsx — человеко-читаемый шаблон. Все имена ниже — best-effort.
 * Единственное место маппинга поле→XML-элемент (single swap point).
 */
const ELEMENTS = {
  record: 'Запись',
  snils: 'СНИЛС',
  fullName: 'ФИО',
  position: 'Должность',
  program: 'ПрограммаОбучения',
  programCodeAttr: 'Код',
  knowledgeCheckDate: 'ДатаПроверкиЗнаний',
  result: 'РезультатПроверкиЗнаний',
  protocolNumber: 'НомерПротокола',
  employerInn: 'ИННРаботодателя'
} as const;

const FORMAT_VERSION = '1.0.3';
const ROOT = 'РеестрОбученныхОТ';

export interface OtRegistryOrg {
  inn?: string;
  registrationNumber?: string;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

@Injectable()
export class OtRegistryXmlWriter {
  readonly contentType = 'application/xml';

  build(rows: OtRegistryRow[], org: OtRegistryOrg = {}): Buffer {
    const e = ELEMENTS;
    const attrs = [
      `ВерсияФормата="${FORMAT_VERSION}"`,
      org.inn ? `ИННОрганизации="${escapeXml(org.inn)}"` : '',
      org.registrationNumber ? `РегНомерОрганизации="${escapeXml(org.registrationNumber)}"` : ''
    ]
      .filter(Boolean)
      .join(' ');

    const tag = (name: string, val: string): string => `    <${name}>${escapeXml(val)}</${name}>`;

    const body = rows
      .map((r) =>
        [
          `  <${e.record}>`,
          tag(e.snils, r.snils),
          tag(e.fullName, r.fullName),
          tag(e.position, r.position),
          `    <${e.program} ${e.programCodeAttr}="${escapeXml(String(r.programRegistryId))}">${escapeXml(r.programName)}</${e.program}>`,
          tag(e.knowledgeCheckDate, r.knowledgeCheckDate),
          tag(e.result, r.result),
          tag(e.protocolNumber, r.protocolNumber),
          tag(e.employerInn, r.employerInn),
          `  </${e.record}>`
        ].join('\n')
      )
      .join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<${ROOT} ${attrs}>\n${body}\n</${ROOT}>\n`;
    return Buffer.from(xml, 'utf-8');
  }
}
```

- [ ] **Step 4: Запустить тест — убедиться, что проходит**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/ot-registry/ot-registry-xml.writer.test.ts --no-file-parallelism`
Expected: PASS (2 теста).

- [ ] **Step 5 (рекомендуемый коммит):**

```bash
git add apps/backend/src/modules/mvp/ot-registry/ot-registry-xml.writer.ts apps/backend/src/modules/mvp/ot-registry/ot-registry-xml.writer.test.ts
git commit -m "feat(backend): provisional XSD-1.0.3 XML writer for ОТ-registry export"
```

---

### Task 3: Выбор формата `xlsx|xml` через DTO → сервис → DI

Прокинуть `format` сквозь DTO/фильтр, выбрать writer в сервисе, сохранить `batch.format`, зарегистрировать XML-writer в модуле, обновить инстанцирование сервиса в тесте.

**Files:**

- Modify: `apps/backend/src/modules/mvp/ot-registry-export.dto.ts`
- Modify: `apps/backend/src/modules/mvp/mvp.types.ts:559` (OtRegistryRow рядом — добавляем поле в OtRegistryBatch, см. ниже)
- Modify: `apps/backend/src/modules/mvp/ot-registry/ot-registry.service.ts`
- Modify: `apps/backend/src/modules/mvp/mvp.module.ts:15-34`
- Test: `apps/backend/src/modules/mvp/ot-registry/ot-registry.service.test.ts` (инстанцирование + новый кейс)

- [ ] **Step 1: Добавить `format` в DTO**

В `apps/backend/src/modules/mvp/ot-registry-export.dto.ts` заменить импорт и добавить поле:

```ts
import { IsIn, IsOptional, IsString } from 'class-validator';

export class CreateOtRegistryExportDto {
  @IsOptional()
  @IsString()
  groupId?: string;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  enrolledFrom?: string;

  @IsOptional()
  @IsString()
  enrolledTo?: string;

  @IsOptional()
  @IsIn(['xlsx', 'xml'])
  format?: 'xlsx' | 'xml';
}
```

- [ ] **Step 2: Добавить `format` в тип батча**

В `apps/backend/src/modules/mvp/mvp.types.ts` в интерфейс `OtRegistryBatch` (после `generatedBy: string;`, перед `}`) добавить:

```ts
  /** PROVISIONAL формат сгенерированного файла. Отсутствует у старых батчей → трактуется как 'xlsx'. */
  format?: 'xlsx' | 'xml';
```

- [ ] **Step 3: Написать падающий тест на XML-ветку сервиса**

В `apps/backend/src/modules/mvp/ot-registry/ot-registry.service.test.ts`, в `describe('OtRegistryService.exportOtRegistry', …)` добавить кейс:

```ts
it('format:"xml" generates an application/xml file and records batch.format', async () => {
  const h = makeHarness();
  seedCompletedEnrollment(h.state, { programCodes: ['OT_A'], examPassed: true });

  const outcome = await h.service.exportOtRegistry(TENANT, { format: 'xml' }, ctx);

  expect(outcome.exported).toBe(1);
  expect(outcome.fileId).toBeTruthy();
  expect(h.state.otRegistryBatches[0]!.format).toBe('xml');
  // The registered file is xml-typed with an .xml key.
  const reg = h.filesRegister.mock.calls[0]![0] as { mimeType: string; storageKey: string };
  expect(reg.mimeType).toBe('application/xml');
  expect(reg.storageKey.endsWith('.xml')).toBe(true);
});
```

- [ ] **Step 4: Запустить — убедиться, что падает**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/ot-registry/ot-registry.service.test.ts --no-file-parallelism`
Expected: FAIL — `h.service.exportOtRegistry` не знает `format` / `batch.format` undefined / тип `OtRegistryExportFilter` не имеет `format` (TS) и/или конструктор сервиса не принимает xml-writer.

- [ ] **Step 5: Зарегистрировать writer в модуле**

В `apps/backend/src/modules/mvp/mvp.module.ts`:

- после строки 15 (`import { OtRegistryXlsxWriter } …`) добавить:

```ts
import { OtRegistryXmlWriter } from './ot-registry/ot-registry-xml.writer.js';
```

- в массив `providers` (рядом со строкой 33 `OtRegistryXlsxWriter,`) добавить новой строкой:

```ts
    OtRegistryXmlWriter,
```

- [ ] **Step 6: Внедрить writer и реализовать ветку формата в сервисе**

В `apps/backend/src/modules/mvp/ot-registry/ot-registry.service.ts`:

(a) импорт рядом со строкой 8:

```ts
import { OtRegistryXmlWriter } from './ot-registry-xml.writer.js';
```

(b) в `OtRegistryExportFilter` (после `enrolledTo?: string;`) добавить:

```ts
  format?: 'xlsx' | 'xml';
```

(c) в конструкторе — добавить инъекцию между `xlsx` и `auditService`:

```ts
    @Inject(OtRegistryXlsxWriter) private readonly xlsx: OtRegistryXlsxWriter,
    @Inject(OtRegistryXmlWriter) private readonly xml: OtRegistryXmlWriter,
    @Inject(AuditService) private readonly auditService: AuditService
```

(d) перед созданием `const batch` (строка ~187 `const now = …`) вычислить формат:

```ts
const format: 'xlsx' | 'xml' = filter.format === 'xml' ? 'xml' : 'xlsx';
```

(e) в объект `batch` (литерал начиная со строки ~188) добавить поле сразу после `generatedBy: ctx.userId ?? ''`:

```ts
generatedBy: (ctx.userId ?? '', format);
```

(f) заменить блок `if (exported) { … }` (строки ~202-219) на:

```ts
if (exported) {
  const buffer = format === 'xml' ? this.xml.build(valid) : await this.xlsx.build(valid);
  const contentType = format === 'xml' ? this.xml.contentType : this.xlsx.contentType;
  const storageKey = `${tenantId}/ot-registry/${batch.id}.${format}`;
  const meta = await this.files.register({
    tenantId,
    storageKey,
    originalName: `ot-registry-${batch.id}.${format}`,
    mimeType: contentType,
    sizeBytes: buffer.length,
    antivirusStatus: 'clean'
  });
  await this.storage.putObject({
    key: storageKey,
    body: buffer,
    contentType
  });
  batch.fileId = meta.id;
}
```

- [ ] **Step 7: Обновить инстанцирование сервиса в тесте**

В `apps/backend/src/modules/mvp/ot-registry/ot-registry.service.test.ts`:

- после строки 6 (`import { OtRegistryXlsxWriter } …`) добавить:

```ts
import { OtRegistryXmlWriter } from './ot-registry-xml.writer.js';
```

- в `makeHarness()` заменить инстанцирование сервиса (строки ~266-274) на:

```ts
const service = new OtRegistryService(
  state,
  mvp,
  documents,
  files,
  storage,
  new OtRegistryXlsxWriter(),
  new OtRegistryXmlWriter(),
  audit
);
```

- [ ] **Step 8: Запустить тест сервиса — все проходят (включая старые)**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/ot-registry/ot-registry.service.test.ts --no-file-parallelism`
Expected: PASS (старые кейсы без `format` идут по ветке `xlsx` — поведение идентично; новый xml-кейс зелёный).

- [ ] **Step 9: Тайпчек бэкенда**

Run: `pnpm --filter @cdoprof/backend exec tsc -p tsconfig.json --noEmit`
Expected: PASS.

- [ ] **Step 10 (рекомендуемый коммит):**

```bash
git add apps/backend/src/modules/mvp/ot-registry-export.dto.ts apps/backend/src/modules/mvp/mvp.types.ts apps/backend/src/modules/mvp/ot-registry/ot-registry.service.ts apps/backend/src/modules/mvp/mvp.module.ts apps/backend/src/modules/mvp/ot-registry/ot-registry.service.test.ts
git commit -m "feat(backend): select ОТ-registry export format (xlsx|xml)"
```

---

### Task 4: Frontend — выбор формата + provisional-баннер

Прокинуть `format` в api, добавить `<select>` формата и баннер-предупреждение в секцию «Реестр обученных по ОТ», обновить контракт-тест.

**Files:**

- Modify: `apps/frontend/src/features/gov-export/api.ts:23-36`
- Modify: `apps/frontend/src/features/gov-export/types.ts:36-49` (OtRegistryBatch.format)
- Modify: `apps/frontend/app/gov-export/page.tsx`
- Test: `apps/frontend/src/features/gov-export/api.contract.test.ts`

- [ ] **Step 1: Расширить api-метод `format`-параметром**

В `apps/frontend/src/features/gov-export/api.ts` заменить сигнатуру `createOtRegistryExport` (строки 23-36) на:

```ts
  createOtRegistryExport: (
    session: UserSession,
    body: {
      groupId?: string;
      clientId?: string;
      enrolledFrom?: string;
      enrolledTo?: string;
      format?: 'xlsx' | 'xml';
    }
  ): Promise<OtRegistryExportOutcome> =>
    apiRequest<OtRegistryExportOutcome>('/ot-registry/exports', {
      method: 'POST',
      body,
      ...withAuth(session)
    }),
```

- [ ] **Step 2: Зеркалировать `format` в типе батча**

В `apps/frontend/src/features/gov-export/types.ts` в `OtRegistryBatch` (после `generatedBy: string;`) добавить:

```ts
  format?: 'xlsx' | 'xml';
```

- [ ] **Step 3: Обновить падающий контракт-тест**

В `apps/frontend/src/features/gov-export/api.contract.test.ts` в кейсе `createOtRegistryExport posts to /ot-registry/exports …` (строки 64-78) заменить вызов и проверку тела на:

```ts
const result = await govExportApi.createOtRegistryExport(session, {
  groupId: 'grp_1',
  enrolledFrom: '2026-01-01',
  enrolledTo: '2026-12-31',
  format: 'xml'
});

expect(result.batchId).toBe('batch_1');
expect(result.exported).toBe(9);
expect(result.failed).toBe(1);

const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
expect(calledUrl).toContain('/ot-registry/exports');
expect(init.method).toBe('POST');
const body = JSON.parse(init.body as string) as { groupId: string; format: string };
expect(body.groupId).toBe('grp_1');
expect(body.format).toBe('xml');
```

- [ ] **Step 4: Запустить контракт-тест — убедиться, что падает**

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/features/gov-export/api.contract.test.ts --no-file-parallelism`
Expected: FAIL — `body.format` === undefined (страница ещё не шлёт format; но api уже принимает — тест шлёт format напрямую, поэтому упадёт только если Step 1 не применён; если Step 1 применён, этот тест уже зелёный). Если зелёный сразу — это ок, переходим к Step 5.

- [ ] **Step 5: Добавить состояние формата + `<select>` + баннер в страницу**

В `apps/frontend/app/gov-export/page.tsx`:

(a) рядом с состоянием ОТ-секции (после строки 33 `const [groupId, setGroupId] = useState('');`) добавить:

```tsx
const [otFormat, setOtFormat] = useState<'xlsx' | 'xml'>('xlsx');
```

(b) в `onGenerateOt` (строки 44-46) передать формат:

```tsx
const outcome = await govExportApi.createOtRegistryExport(session, {
  ...(groupId ? { groupId } : {}),
  format: otFormat
});
```

(c) в `<SectionCard title="Реестр обученных по ОТ (Минтруд)">` (строка 162) первым дочерним элементом, до `<FilterBar>`, добавить provisional-баннер:

```tsx
<p
  role="note"
  style={{
    background: '#FEF3C7',
    border: '1px solid #F59E0B',
    borderRadius: 6,
    padding: '8px 12px',
    margin: '0 0 12px'
  }}
>
  ⚠️ Формат выгрузки предварительный (не сверен с эталоном ЛКОТ). Перед подачей в реестр сверьте
  колонки/XSD-схему 1.0.3 в личном кабинете.
</p>
```

(d) в `<FilterBar>` ОТ-секции (после `<input … placeholder="ID группы …">`, строка ~168) добавить выбор формата:

```tsx
<select value={otFormat} onChange={(event) => setOtFormat(event.target.value as 'xlsx' | 'xml')}>
  <option value="xlsx">Excel (.xlsx)</option>
  <option value="xml">XML (XSD 1.0.3)</option>
</select>
```

- [ ] **Step 6: Тайпчек фронтенда**

Run: `pnpm --filter @cdoprof/frontend exec tsc -p tsconfig.json --noEmit`
Expected: PASS.

- [ ] **Step 7: Запустить контракт- и e2e-smoke-тесты gov-export**

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/features/gov-export/api.contract.test.ts src/e2e/ot-registry-export.e2e.test.ts --no-file-parallelism`
Expected: PASS (контракт шлёт format:'xml'; e2e smoke по-прежнему зелёный — модули грузятся, маршрут/права не тронуты).

- [ ] **Step 8 (рекомендуемый коммит):**

```bash
git add apps/frontend/src/features/gov-export/api.ts apps/frontend/src/features/gov-export/types.ts apps/frontend/app/gov-export/page.tsx apps/frontend/src/features/gov-export/api.contract.test.ts
git commit -m "feat(frontend): ОТ-registry export format selector + provisional banner"
```

---

### Task 5: Документация + финальные гейты

**Files:**

- Modify: `README.md` (§2 AI Agent State)
- Modify: `LMS_AGENT_HANDOFF.md` (новый §5.101)
- Modify: `docs/superpowers/plans/2026-06-01-ot-registry-provisional-templates.md` (тики чекбоксов)

- [ ] **Step 1: Прогнать локальные гейты**

Run: `pnpm typecheck` → Expected: PASS (8/8).
Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/ot-registry/ --no-file-parallelism` → Expected: PASS (все ot-registry файлы).
Run: `pnpm --filter @cdoprof/frontend exec vitest run src/features/gov-export src/e2e/ot-registry-export.e2e.test.ts --no-file-parallelism` → Expected: PASS.
Run: `npx eslint apps/backend/src/modules/mvp/ot-registry/ot-registry-xml.writer.ts apps/frontend/app/gov-export/page.tsx --max-warnings=0` → Expected: clean.

- [ ] **Step 2: Обновить README §2** — Last Completed Task / Current Task / дата (2026-06-01): «ОТ-реестр: provisional-шаблоны + XML-сериализатор (XSD 1.0.3), выбор формата xlsx|xml, provisional-баннер. Артефакты помечены, сверить с эталоном ЛКОТ перед боевой отправкой».

- [ ] **Step 3: Добавить `### 5.101` в LMS_AGENT_HANDOFF.md** — summary, files changed, test status, deviations (ФИО комбинированный, 0045 не трогали, статус-колонку ответа не добавляли, опция несданных вне scope), ссылка на этот план + spec §16.

- [ ] **Step 4: Протикать чекбоксы в этом плане.**

- [ ] **Step 5 (рекомендуемый коммит):**

```bash
git add README.md LMS_AGENT_HANDOFF.md docs/superpowers/plans/2026-06-01-ot-registry-provisional-templates.md docs/superpowers/specs/2026-05-31-eisot-ot-trained-registry-export-design.md
git commit -m "docs(handoff): ОТ-registry provisional templates + XML (§5.101)"
```

---

## Self-Review

**Spec coverage (§16):** ① provisional-маркировка → Task 1 + комментарии в Task 2/3. ② .xlsx-колонки → остаются (Task 1 помечает; ФИО комбинированный — deviation). ③ XML-сериализатор → Task 2 + ветка формата Task 3. ④ файл-ответ → Task 1 (комментарий; структура без изменений — deviation). UI provisional-баннер + переключатель → Task 4. Docs → Task 5. ✔

**Placeholder scan:** все шаги содержат конкретный код/команды. ✔

**Type consistency:** `OtRegistryXmlWriter.build(rows, org?)` → `Buffer`; `contentType='application/xml'`; `format?: 'xlsx'|'xml'` одинаково в DTO, `OtRegistryExportFilter`, `OtRegistryBatch` (backend+frontend); конструктор сервиса: порядок `(…, storage, xlsx, xml, audit)` — синхронно изменён в сервисе и в `makeHarness()`. ✔
