# КЭП-подпись файлов-выгрузок — provider-agnostic seam (dormant)

**Дата:** 2026-06-17
**Статус:** утверждён владельцем (дизайн), готов к плану
**Ветка:** `feat/2026-06-17-export-kep-signature-seam`
**Связано:** [[2026-06-15-phase-6-esign-provider-seam]] (НЭП-документы, §5.129), §5.131 (проброс `signatureStatus`), `project_esign_phase6` (решение владельца: гибрид НЭП(документы)+КЭП(выгрузки))

## 1. Проблема

Пять реестровых экспортёров (`mvp/{frdo,ot,eisot-testing,rostechnadzor,nmo}-registry/`) формируют XLSX и отдают его в госреестры (ФИС ФРДО, ОТ-реестр Минтруда, ЕИСОТ, Ростехнадзор, Минздрав-НМО) **без подписи**. По решению владельца (право РФ 2026) приёму файла регулятором юр-силу даёт **КЭП организации** (один сертификат от УЦ ФНС) на **detached**-подписи файла выгрузки. Эта половина гибридной модели (НЭП на документы слушателям + КЭП на выгрузки) сейчас **отсутствует в коде на 100%** — реализована только НЭП-половина (document-signature seam, §5.129/§5.131).

Цель — закрыть КЭП-половину **на уровне шва** (provider-agnostic, dormant), симметрично document-seam: реальный КриптоПро-ГОСТ-движок подключается адаптером позже под лицензию (отдельный follow-up). Никакой реальной криптографии в этой работе.

## 2. Существующий паттерн (во что встраиваемся)

Все 5 сервисов разделяют один путь генерации (эталон — `frdo-registry.service.ts:160-177`):

```ts
if (exported) {
  const buffer = await this.xlsx.build(valid);
  const storageKey = `${tenantId}/<registry>/${batch.id}.xlsx`;
  const meta = await this.files.register({
    tenantId,
    storageKey,
    originalName,
    mimeType,
    sizeBytes,
    antivirusStatus: 'clean'
  });
  await this.storage.putObject({ key: storageKey, body: buffer, contentType });
  batch.fileId = meta.id;
}
```

Подпись встраивается **сразу после** `batch.fileId = meta.id`. Каждый сервис request-scoped, инжектит `FilesService` + `S3StorageClient` + `AuditService`. Батч-сущности (`FrdoRegistryBatch`, `OtRegistryBatch`, `EisotTestingBatch`, `RostechnadzorRegistryBatch`, `NmoRegistryBatch`) живут в MVP-state (JSON-снимки, без миграции). Скачивание — `getBatchDownloadUrl` → `files.createDownloadUrl(tenantId, fileId)`.

## 3. Архитектура (зеркало document-signature seam)

### 3.1 Seam `infrastructure/export-signature/`

```ts
export type ExportSignatureStatus = 'unsigned' | 'signed' | 'failed';

export interface SignExportParams {
  tenantId: string;
  /** files-meta id выгружаемого XLSX (для трассировки/аудита). */
  fileId: string;
  /** Сырые байты файла — над ними строится detached-подпись. */
  content: Buffer;
}

export interface ExportSignatureResult {
  status: ExportSignatureStatus;
  /** Detached-подпись (CMS/PKCS#7, `.p7s`) как байты — caller сохраняет соседним файлом. Set when signed. */
  signatureContent?: Buffer;
  /** Subject/thumbprint сертификата КЭП для отображения+аудита. Set when signed. */
  certificateSubject?: string;
  /** Текст ошибки при status==='failed'. */
  detail?: string;
}

export interface ExportSignatureProvider {
  readonly id: string; // 'noop' | 'fake' | 'cryptopro'
  sign(params: SignExportParams): Promise<ExportSignatureResult>;
}

export const EXPORT_SIGNATURE_PROVIDER = Symbol('EXPORT_SIGNATURE_PROVIDER');
```

**Ключевое отличие от document-seam:** document-провайдер подписывает PDF **встроенным** штампом (НЭП) и возвращает opaque `signatureRef`; export-провайдер строит **detached** `.p7s` (КЭП) над байтами и возвращает `signatureContent` (caller сам кладёт его в storage). Разные сертификаты, разное назначение → **отдельный seam, не переиспользуем `DocumentSignatureProvider`**.

- `NoopExportSignatureProvider` (`id='noop'`) → `{status:'unsigned'}`. Default везде.
- `FakeExportSignatureProvider` (`id='fake'`, конструктор `signerName`) → синтетический detached: `signatureContent` = небольшой плейсхолдер-байт-блок с самопометкой (напр. `Buffer.from('FAKE-P7S STAGING — не криптоподпись over ' + fileId)`), `certificateSubject = 'CN=<signerName> (STAGING, не криптоподпись)'`. Для owner-превью пайплайна без КриптоПро. **Запрещён в `NODE_ENV=production`** (см. 3.4).

### 3.2 Общий хелпер `signExportArtifact`

Чистая функция-оркестратор (в `infrastructure/export-signature/sign-export-artifact.ts`), вызываемая всеми 5 сервисами — устраняет дублирование:

```ts
interface SignExportArtifactDeps {
  provider: ExportSignatureProvider | undefined;
  files: FilesService;
  storage: S3StorageClient;
}
interface SignExportArtifactInput {
  tenantId: string;
  fileId: string; // meta.id выгружаемого XLSX
  storageKey: string; // ключ XLSX, .p7s кладётся как `${storageKey}.p7s`
  buffer: Buffer; // байты XLSX
}
interface SignExportArtifactOutput {
  signatureStatus: ExportSignatureStatus; // 'unsigned' если провайдер отсутствует/noop
  signatureFileId?: string;
  signatureCertificateSubject?: string;
}

async function signExportArtifact(deps, input): Promise<SignExportArtifactOutput>;
```

Поведение:

- провайдер отсутствует или `id==='noop'` → `{signatureStatus:'unsigned'}` (короткое замыкание, как document `applySignature`);
- провайдер активен → `await provider.sign(...)`;
  - `signed` → `files.register(...p7s)` + `storage.putObject({key: \`${storageKey}.p7s\`, body: signatureContent, contentType: 'application/pkcs7-signature'})`→ вернуть`signatureFileId` + subject;
  - `failed` → `{signatureStatus:'failed'}`;
- **fail-soft:** исключение провайдера/хранилища ловится → `{signatureStatus:'failed'}` (НЕ роняет экспорт — XLSX уже сохранён). Зеркалит fail-soft document-подписи и AV-гейта.

### 3.3 Интеграция в 5 экспортёров

В каждом сервисе сразу после `batch.fileId = meta.id`:

```ts
const sig = await signExportArtifact(
  { provider: this.exportSigner, files: this.files, storage: this.storage },
  { tenantId, fileId: meta.id, storageKey, buffer }
);
batch.signatureStatus = sig.signatureStatus;
if (sig.signatureFileId) batch.signatureFileId = sig.signatureFileId;
if (sig.signatureCertificateSubject)
  batch.signatureCertificateSubject = sig.signatureCertificateSubject;
```

(conditional-assign под `exactOptionalPropertyTypes`). Провайдер инжектится 8-й опциональной зависимостью `@Optional() @Inject(EXPORT_SIGNATURE_PROVIDER)` в каждый сервис (back-compat: существующие тесты конструируют без неё → `unsigned`).

### 3.4 Env + фабрика

`env.schema.ts`:

```ts
EXPORT_SIGN_ENABLED: <кастомный boolean-парс, default false>   // как ESIGN_ENABLED
EXPORT_SIGN_PROVIDER: z.enum(['noop', 'cryptopro', 'fake']).default('noop')
EXPORT_SIGN_SIGNER_NAME: z.string().min(1).default('CDOProf')
```

Refinement (тот же блок прод-гардов): `EXPORT_SIGN_PROVIDER==='fake' && NODE_ENV==='production'` → ошибка валидации (fake фабрикует подпись; staging намеренно разрешён — owner-preview env; прод герметичен через `DEPLOYMENT_PROFILE=prod ⟺ NODE_ENV=production`). Зеркало решения §5.131.

Фабрика `EXPORT_SIGNATURE_PROVIDER` в `MvpModule` (там живут 5 registry-сервисов):

```ts
useFactory: () => {
  if (backendEnv.EXPORT_SIGN_ENABLED && backendEnv.EXPORT_SIGN_PROVIDER === 'fake')
    return new FakeExportSignatureProvider(backendEnv.EXPORT_SIGN_SIGNER_NAME);
  if (backendEnv.EXPORT_SIGN_ENABLED && backendEnv.EXPORT_SIGN_PROVIDER === 'cryptopro')
    console.warn('[export-sign] cryptopro requested but adapter not implemented — using Noop');
  return new NoopExportSignatureProvider();
};
```

### 3.5 Persistence

3 опциональных поля на каждый из 5 `*RegistryBatch`-типов (`mvp.types.ts`): `signatureStatus?: ExportSignatureStatus`, `signatureFileId?: string`, `signatureCertificateSubject?: string`. **Без миграции** — MVP-state сериализуется целиком (JSON-снимок), как 6 полей подписи на `GeneratedDocumentEntity` в §5.131. Коллекции `*RegistryBatches` уже зарегистрированы.

### 3.6 Выдача

- Detail-ответ батча каждого экспортёра включает `signatureStatus` + `signatureFileId` (+ subject).
- Скачивание `.p7s`: общий метод `getBatchSignatureUrl(tenantId, id)` в каждом сервисе → `files.createDownloadUrl(tenantId, batch.signatureFileId)` (404 если нет подписи), + endpoint `GET …/exports/:id/signature` под тем же правом `regulatory.export.read`.
- Frontend `gov-export`: бейдж «Подписано КЭП» / «Не подписано» на строке батча (опц. ссылка скачать `.p7s`), симметрично document-бейджу §5.131.

## 4. Тестирование (TDD, без КриптоПро)

- `noop-export-signature.provider.test.ts` → `unsigned`.
- `fake-export-signature.provider.test.ts` → `signed` + `signatureContent` непустой + subject содержит signerName + 'STAGING'.
- `sign-export-artifact.test.ts` → active-signed (sig зарегистрирован+сохранён, поля заполнены); throw-провайдера → `failed` без падения; noop → пропуск; storage-throw → `failed`.
- `env.export-sign.test.ts` → fake разрешён в dev/staging, отклонён в production.
- По 1 паритет-тесту на каждый из 5 сервисов: с fake-провайдером экспорт проставляет `batch.signatureStatus='signed'` + `signatureFileId`; без провайдера — `unsigned`.
- Прогон изолированными файлами + `--no-file-parallelism` (Cyrillic-path).

## 5. Что НЕ делаем (YAGNI)

- Реальную ГОСТ-крипто (КриптоПро CSP + SDK адаптер) — отдельный follow-up под лицензию; фабрика возвращает Noop при `cryptopro`.
- Подпись XML-вариантов выгрузок (ОТ-реестр имеет `xml.writer`) — подписываем только основной XLSX-артефакт; XML при необходимости — отдельный шаг.
- Ручной re-sign endpoint — выгрузка пересоздаётся целиком (re-export), отдельная пере-подпись не нужна.
- Новое право — переиспользуем существующее `regulatory.export.read/write`.

## 6. Acceptance

- 5 экспортёров при активном провайдере прицепляют detached-`.p7s` к батчу (поля + файл в storage), при noop/отсутствии — `unsigned`, экспорт не ломается ни при каком сбое подписи.
- Fake запрещён в production env-валидацией, разрешён в dev/staging.
- Без миграции, без нового права. Все изолированные прогоны зелёные, typecheck 8/8, ESLint clean.
- Существующее поведение экспортёров (неподписанный путь) не изменено при dormant-флаге.

## 7. As-built отклонения

_(Заполняется при реализации.)_
