# Phase 10 Track C — PWA + Web Push Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Превратить фронтенд CDOProf в устанавливаемое PWA (web app manifest + service worker для app-shell-кэша) и добавить web-push-уведомления, привязанные к тем же событиям Phase 5, что и email (приглашение, завершение курса, переаттестация, дедлайн, аннулирование документа). Всё **спящее по умолчанию** (`WEB_PUSH_ENABLED=false`), безопасно к мёрджу.

**Spec:** `docs/superpowers/specs/2026-06-13-phase-10a-excel-report-builder-design.md` §11 (Track C bullet) — утверждённый скоуп.

**Branch:** `feat/2026-06-13-phase-10c-pwa-push` off `main`.

## Architecture

Два связных полупроекта:

1. **PWA (frontend):** web app manifest (`app/manifest.ts` — App Router metadata route) + плейсхолдер-иконки в `public/` + service worker через **Serwist** (`@serwist/next` + `src/app/sw.ts`) для precache/app-shell-runtime-кэша. Offline-контент курсов — ОТЛОЖЕН (out of scope). SW регистрируется автоматически инжектором `@serwist/next`.
2. **Push (backend + frontend):** зависимость `web-push`; VAPID-ключи через env (`WEB_PUSH_ENABLED` dormant-toggle + `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` optional + superRefine conditional-required). Новая MVP-коллекция `pushSubscriptions` (per-user браузерные подписки). Self-service эндпоинты subscribe/unsubscribe/list под `TenantGuard`-only (как `notifications.controller.ts` — **без нового права, без RBAC-миграции**). Минимальный **канал «push» внутри `NotificationDispatcher`**: после email-цикла, если `WEB_PUSH_ENABLED` и есть подписки получателей, диспетчер шлёт push, переиспользуя `templateKey → {subject, body}` (тот же `renderTemplate`). **5 call-sites Phase 5 не трогаем** — фан-аут спрятан в `dispatch()`.

### Ключевые решения (деривации; см. также §«Деривации» в конце)

- **D-C1 (Serwist, не next-pwa):** Serwist — официально рекомендованный для Next 15 App Router путь (`@serwist/next` + исходный `src/app/sw.ts`, компилируется через `withSerwist`). `next-pwa` не поддерживает App Router и заброшен. Иконки — простые сгенерированные плейсхолдеры (реальные ассеты владелец даёт позже).
- **D-C2 (MVP-state, без миграции):** `pushSubscriptions` живёт в MVP-state JSON-снимке (как `reportTemplates`/`scormPackages`), регистрируется в `mvp-collections.ts`. Консистентно с остальными коллекциями кодовой базы и с no-migration-принципом Track A. **Tradeoff:** в memory-режиме подписки теряются при рестарте процесса; в prod MVP-state персистится в `learning.mvp_runtime_documents` (postgres-драйвер) → переживает рестарт. Отдельная типизированная таблица не нужна для v1 (web-push подписки дёшевы к пересозданию — браузер повторно подпишется при следующем заходе).
- **D-C3 (право — переиспользование `TenantGuard`-only):** subscribe/unsubscribe/list — self-service (ученик подписывает СВОЙ браузер), скоуп по `ctx.userId`, ровно как `NotificationsController` (нет `@RequirePermissions`). **Никакого нового права, никакой RBAC-миграции** (зеркалит D-A2 Track A).
- **D-C4 (канал-шов в диспетчере):** `NotificationDispatcher` получает опциональную зависимость `WEB_PUSH_SENDER` (token; реализация `WebPushSender` или `NoopWebPushSender` по `WEB_PUSH_ENABLED`, как `MAILER` через `NoopMailer`). `dispatch()` после email-цикла вызывает `pushSender.sendToUsers(...)`. Диспетчер НЕ знает про MVP-state — резолвинг «email → userId → подписки» инкапсулирован в `WebPushSender`, который читает `pushSubscriptions` через выделенный read-port. Это сохраняет диспетчер тонким и 5 call-sites нетронутыми.
- **D-C5 (доставка VAPID public key в браузер):** через **эндпоинт** `GET /web-push/public-key` (TenantGuard-only), НЕ через `NEXT_PUBLIC_` env. Причина: ключ читается рантайм-фронтом из backend-env (single source of truth), не требует пересборки фронта при ротации, и фронт уже ходит за конфигом через `apiRequest`. Эндпоинт возвращает `{ enabled: boolean, publicKey: string | null }` — фронт прячет UI подписки при `enabled=false`.
- **D-C6 (SW scope / same-origin):** SW регистрируется в корне (`/sw.js`, scope `/`). Push доставляется браузером напрямую от push-сервиса (FCM/Mozilla) к SW — same-origin к backend не требуется для самого push. Subscribe-POST идёт через `apiRequest` (тот же `/api/v1/*`, который Caddy уже проксирует на backend в prod). Manifest `start_url: '/'`, `scope: '/'`.

**Конвенции репо (обязательно):**

- Новая MVP-коллекция регистрируется в `apps/backend/src/modules/mvp/infrastructure/mvp-collections.ts` И как поле в `in-memory-mvp.state.ts` — иначе теряется между HTTP-запросами.
- DTO — `class-validator`, в контроллере всегда `assertValidDto(Class, raw)`; ошибки — `throw new BadRequestException({ code, message })`.
- Env boolean — `z.union([z.boolean(), z.enum(['true','false'])]).transform(v => v===true||v==='true').default(false)` (НЕ `z.coerce.boolean`, который мапит `'false'→true`).
- Тесты НЕ используют React Testing Library; frontend-тесты — чистые функции + contract-тесты с `vi.stubGlobal('fetch', ...)` + e2e route-access/dynamic-import smoke.
- Запуск одного файла: `pnpm --filter @cdoprof/backend exec vitest run src/modules/<path>.test.ts --no-file-parallelism` (то же для frontend).
- Историчные миграции не редактируем (для Track C миграция вообще не нужна — D-C2).
- Коммиты — Conventional Commits, многострочные через HEREDOC (bash) или `@'...'@` (PowerShell).

---

### Task 1: Backend deps + env-схема (web-push, VAPID, dormant toggle)

**Files:**

- Modify: `apps/backend/package.json` (deps: `web-push`; devDeps: `@types/web-push`)
- Modify: `apps/backend/src/env.schema.ts`
- Modify: `apps/backend/src/env.schema.test.ts` (если есть — найти через `Glob apps/backend/src/env.schema*.test.ts` или `env*.test.ts`; иначе создать рядом по образцу существующих env-тестов)
- Modify: `infra/.env.production.example`

- [ ] **Step 1: Установить зависимости**

```bash
pnpm --filter @cdoprof/backend add web-push
pnpm --filter @cdoprof/backend add -D @types/web-push
```

- [ ] **Step 2: Env-переменные.** В `apps/backend/src/env.schema.ts` рядом с блоком `PROCTORING_VIDEO_RETENTION_*` / `SCORM_*` (≈строка 75–80) добавить:

```ts
    // Web Push (Phase 10 Track C). Ships dormant (false); ops enables once VAPID keys are
    // generated. Custom boolean parse — NOT z.coerce.boolean (which maps "false" → true).
    WEB_PUSH_ENABLED: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .transform((v) => v === true || v === 'true')
      .default(false),
    /** VAPID public key (base64url). Required when WEB_PUSH_ENABLED=true (see superRefine). */
    VAPID_PUBLIC_KEY: z.string().min(1).optional(),
    /** VAPID private key (base64url). Required when WEB_PUSH_ENABLED=true. */
    VAPID_PRIVATE_KEY: z.string().min(1).optional(),
    /** VAPID subject — mailto: or https: contact for push services. */
    VAPID_SUBJECT: z.string().min(1).default('mailto:no-reply@cdoprof.local'),
```

В `superRefine` (рядом с блоком `NOTIFICATIONS_EMAIL_ENABLED → SMTP_HOST`) добавить conditional-required:

```ts
if (env.WEB_PUSH_ENABLED === true && (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY)) {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ['VAPID_PUBLIC_KEY'],
    message: 'VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are required when WEB_PUSH_ENABLED=true'
  });
}
```

- [ ] **Step 3: `infra/.env.production.example`** (рядом с PROCTORING/SCORM-блоком, тем же стилем):

```bash
# Web Push (Phase 10 Track C) — спящее по умолчанию. Сгенерировать пару VAPID:
#   npx web-push generate-vapid-keys
WEB_PUSH_ENABLED=false
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:admin@your-center.ru
```

- [ ] **Step 4: Env-тесты** — добавить кейсы: при `WEB_PUSH_ENABLED=false` ключи опциональны (парсится); при `WEB_PUSH_ENABLED='true'` без ключей — `safeParse` даёт ошибку с `path:['VAPID_PUBLIC_KEY']`; `WEB_PUSH_ENABLED='false'` строкой → `false` (не `true`); дефолт `VAPID_SUBJECT`. Если файла env-тестов нет, создать `apps/backend/src/env.schema.test.ts`, импортируя `backendEnvSchema`, прогоняя `.safeParse(validBaseEnv)` (собрать минимальный валидный env — посмотреть, есть ли фикстура в репо через `Grep "backendEnvSchema.parse\|safeParse" apps/backend/src`).

- [ ] **Step 5: Проверка** — `pnpm --filter @cdoprof/backend exec vitest run src/env.schema.test.ts --no-file-parallelism` + `pnpm typecheck` → PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/package.json pnpm-lock.yaml apps/backend/src/env.schema.ts apps/backend/src/env.schema.test.ts infra/.env.production.example
git commit -m "chore(deps): web-push + VAPID env vars (dormant WEB_PUSH_ENABLED toggle)"
```

**Acceptance:** env-тесты зелёные (conditional-required работает, `'false'`-строка не включает push); typecheck PASS.

---

### Task 2: Backend-типы + MVP-state коллекция `pushSubscriptions`

**Files:**

- Modify: `apps/backend/src/modules/mvp/mvp.types.ts`
- Modify: `apps/backend/src/modules/mvp/infrastructure/in-memory-mvp.state.ts`
- Modify: `apps/backend/src/modules/mvp/infrastructure/mvp-collections.ts`

- [ ] **Step 1: Тип.** В конец `mvp.types.ts` (рядом с другими Phase-типами):

```ts
// ─── Phase 10 Track C: Web Push subscriptions ───

/** Браузерная push-подписка одного устройства пользователя (PushSubscription.toJSON()). */
export interface PushSubscription extends BaseEntity {
  userId: string;
  /** Уникальный endpoint push-сервиса браузера — ключ дедупликации per (tenant, endpoint). */
  endpoint: string;
  /** p256dh-ключ из subscription.keys. */
  p256dh: string;
  /** auth-ключ из subscription.keys. */
  auth: string;
  /** UA для диагностики/отзыва устройства (опционально). */
  userAgent?: string;
}
```

`BaseEntity` уже даёт `id`, `tenantId`, `createdAt`, `updatedAt`, `status`.

- [ ] **Step 2: State.** В `in-memory-mvp.state.ts` — импорт типа и поле:

```ts
  // Phase 10 Track C — web-push подписки браузеров пользователей.
  pushSubscriptions: PushSubscription[] = [];
```

- [ ] **Step 3: Коллекция.** В `mvp-collections.ts` добавить `'pushSubscriptions'` в конец `MVP_COLLECTIONS` (без этого коллекция не переживёт HTTP-запрос).

- [ ] **Step 4: Проверка** — `pnpm typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/mvp/mvp.types.ts apps/backend/src/modules/mvp/infrastructure/in-memory-mvp.state.ts apps/backend/src/modules/mvp/infrastructure/mvp-collections.ts
git commit -m "feat(backend): pushSubscriptions MVP-state collection + type"
```

**Acceptance:** typecheck PASS; `'pushSubscriptions'` присутствует в `MVP_COLLECTIONS` и как поле state.

---

### Task 3: VAPID base64url → Uint8Array + подписка-сериализация — чистые функции (TDD)

**Files:**

- Create: `apps/backend/src/modules/communication/web-push/web-push-keys.ts`
- Test: `apps/backend/src/modules/communication/web-push/web-push-keys.test.ts`

> Этот же конвертер зеркалится на фронте (Task 11). Backend-копия используется для валидации формы подписки; держим как чистую функцию без DI.

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it } from 'vitest';

import { isValidBrowserSubscription, normalizeSubscription } from './web-push-keys.js';

describe('normalizeSubscription', () => {
  it('извлекает endpoint + keys из PushSubscription.toJSON()', () => {
    const raw = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
      keys: { p256dh: 'BPp256', auth: 'AuthKey' }
    };
    expect(normalizeSubscription(raw)).toEqual({
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
      p256dh: 'BPp256',
      auth: 'AuthKey'
    });
  });
});

describe('isValidBrowserSubscription', () => {
  it('true для корректной подписки', () => {
    expect(
      isValidBrowserSubscription({ endpoint: 'https://x/y', keys: { p256dh: 'a', auth: 'b' } })
    ).toBe(true);
  });
  for (const bad of [
    null,
    {},
    { endpoint: 'https://x' },
    { endpoint: 'not-a-url', keys: { p256dh: 'a', auth: 'b' } },
    { endpoint: 'https://x', keys: { p256dh: 'a' } }
  ]) {
    it(`false для ${JSON.stringify(bad)}`, () => {
      expect(isValidBrowserSubscription(bad)).toBe(false);
    });
  }
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Реализация** — `web-push-keys.ts`: `normalizeSubscription(raw)` → `{ endpoint, p256dh, auth }`; `isValidBrowserSubscription(raw): boolean` (endpoint — https-URL, keys.p256dh и keys.auth — непустые строки). Без зависимостей.

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/communication/web-push/web-push-keys.*
git commit -m "feat(backend): pure web-push subscription validation/normalization"
```

**Acceptance:** все кейсы зелёные; функции чистые (без `web-push`/Nest импортов).

---

### Task 4: PushSubscriptionService — CRUD подписок + tenant/user-изоляция (TDD)

**Files:**

- Create: `apps/backend/src/modules/communication/web-push/push-subscription.service.ts`
- Test: `apps/backend/src/modules/communication/web-push/push-subscription.service.test.ts`

> Сервис читает/пишет `pushSubscriptions` через MVP-state. Скоуп — `Scope.REQUEST` (как другие MVP-сервисы, инжектит `MVP_STATE`). Harness теста: создать `InMemoryMvpState`, мок `AuditService` (`vi.fn`), инстанцировать сервис напрямую. Образец стиля аудита/инъекции — `eisot-testing-registry.service.ts`.

- [ ] **Step 1: Failing tests** (минимум):

```ts
it('subscribe: создаёт подписку для (tenant,user) с дедупом по endpoint (повтор → upsert, не дубль)', ...);
it('subscribe: чужой tenant не видит подписку (listForUser изолирован по tenantId+userId)', ...);
it('unsubscribe: по endpoint удаляет только свою подписку, чужие нетронуты', ...);
it('listForUser: возвращает только подписки данного (tenant,user)', ...);
it('listEndpointsForUsers: батч-резолв (tenant, userId[]) → подписки — используется push-sender-ом', ...);
it('removeByEndpoint: вызывается при 404/410 от push-сервиса (отзыв протухшей подписки)', ...);
it('subscribe пишет audit (notifications.push_subscribed); unsubscribe — notifications.push_unsubscribed', ...);
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Реализация** — методы:
  - `subscribe(tenantId, userId, raw, ctx)` — `normalizeSubscription` + upsert по `(tenantId, endpoint)` (повторная подписка того же браузера обновляет keys/userId, не плодит дубли); `audit`.
  - `unsubscribe(tenantId, userId, endpoint, ctx)` — удаляет запись с этим `endpoint`, принадлежащую `userId`; `audit`.
  - `listForUser(tenantId, userId)` — `state.pushSubscriptions.filter(...)`.
  - `listEndpointsForUsers(tenantId, userIds: string[])` — для push-sender-а (Task 5): возвращает `PushSubscription[]` по множеству userId.
  - `removeByEndpoint(tenantId, endpoint)` — зачистка протухшей подписки (вызовет sender при 404/410).
  - Tenant-изоляция: каждый метод фильтрует по `tenantId`.

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/communication/web-push/push-subscription.service.*
git commit -m "feat(backend): push-subscription service (CRUD, tenant/user isolation, audit, dedup)"
```

**Acceptance:** изоляция и дедуп покрыты тестами; audit-вызовы проверены моками.

---

### Task 5: WebPushSender + Noop + DI-токен (TDD)

**Files:**

- Create: `apps/backend/src/modules/communication/web-push/web-push-sender.ts` (interface + token `WEB_PUSH_SENDER`)
- Create: `apps/backend/src/modules/communication/web-push/web-push-sender.service.ts` (`WebPushSender` через `web-push` lib)
- Create: `apps/backend/src/modules/communication/web-push/noop-web-push-sender.ts`
- Test: `apps/backend/src/modules/communication/web-push/web-push-sender.service.test.ts`

> Образец «реальная vs Noop-реализация по env» — `MAILER` (`NoopMailer`/`SmtpMailer`) в `communication.module.ts`. Библиотеку `web-push` мокаем через `vi.mock('web-push', ...)`.

- [ ] **Step 1: Интерфейс** (`web-push-sender.ts`):

```ts
export const WEB_PUSH_SENDER = Symbol('WEB_PUSH_SENDER');

export interface WebPushNotification {
  title: string;
  body: string;
  /** Глубокая ссылка для клика по уведомлению (опц.). */
  url?: string;
}

export interface WebPushSenderPort {
  /** Шлёт push всем подпискам перечисленных пользователей в тенанте. Тихо игнорит, если push выключен. */
  sendToUsers(
    tenantId: string,
    userIds: string[],
    notification: WebPushNotification
  ): Promise<void>;
}
```

- [ ] **Step 2: Failing tests** для `WebPushSender`:

```ts
it('sendToUsers: резолвит подписки через push-subscription-service и шлёт web-push.sendNotification на каждую', ...);
it('payload содержит title/body/url в JSON (то, что SW покажет)', ...);
it('410/404 от push-сервиса → removeByEndpoint (зачистка протухшей подписки), остальные доставляются', ...);
it('нет подписок у пользователей → ноль вызовов sendNotification (no-op)', ...);
it('setVapidDetails вызывается с subject/public/private из env один раз при инициализации', ...);
```

- [ ] **Step 3: Run** → FAIL.

- [ ] **Step 4: Реализация:**
  - `WebPushSender` инжектит `PushSubscriptionService` + читает VAPID из `backendEnv`; в конструкторе `webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)`. `sendToUsers` → `listEndpointsForUsers` → `Promise.allSettled` по `webpush.sendNotification({endpoint,keys}, JSON.stringify({title,body,url}))`; на ошибке со `statusCode` 404/410 → `removeByEndpoint`. Логировать прочие ошибки, не бросать (push best-effort, не должен ломать email-доставку).
  - `NoopWebPushSender.sendToUsers` → `Promise.resolve()`.

- [ ] **Step 5: Run** → PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/communication/web-push/web-push-sender.* apps/backend/src/modules/communication/web-push/noop-web-push-sender.ts
git commit -m "feat(backend): WebPushSender (web-push lib) + Noop + stale-subscription cleanup"
```

**Acceptance:** sender тестируется с мок-`web-push`; 410-cleanup и no-subscription-no-op покрыты; Noop не зависит от `web-push`.

---

### Task 6: Шов канала push в NotificationDispatcher (TDD)

**Files:**

- Modify: `apps/backend/src/modules/communication/notification-dispatcher.service.ts`
- Modify: `apps/backend/src/modules/communication/notification-dispatcher.service.test.ts`
- Create: `apps/backend/src/modules/communication/web-push/template-push-mapping.ts` (+ test) — `templateKey → WebPushNotification` из отрендеренного email (переиспользует subject как title, первую строку body как текст).

> **Ключевой инвариант:** 5 call-sites Phase 5 (`enrollment-email.listener`, `recertification-scanner`, `course-deadline-scanner`, `document-revoked-email.listener`) НЕ меняются — фан-аут спрятан в `dispatch()`. Диспетчер не знает про MVP-state: он зовёт `WebPushSenderPort.sendToUsers`, а резолв «получатель → userId» делает sender/маппер.

- [ ] **Step 1: template-push-mapping (чистая функция, TDD).** `toPushNotification(rendered: EmailTemplateBody, opts?: { url?: string }): WebPushNotification` — `title = rendered.subject`, `body = первая непустая строка rendered.body` (обрезать до ~120 символов). Тесты: длинный body обрезается; пустые строки пропускаются.

- [ ] **Step 2: Failing dispatcher-тесты.** Расширить `notification-dispatcher.service.test.ts` (инжектить мок `WEB_PUSH_SENDER`):

```ts
it('dispatch: после email-цикла зовёт pushSender.sendToUsers с title/body из rendered, если WEB_PUSH_ENABLED', ...);
it('dispatch: WEB_PUSH_ENABLED=false → Noop sender, sendToUsers не делает сетевых вызовов (email-путь не затронут)', ...);
it('dispatch: dedupKey-скип email НЕ шлёт push (ранний return сохранён)', ...);
it('dispatch: ошибка push НЕ ломает dispatch (email уже записан в journal)', ...);
it('recipients без userId (внешний email) пропускаются push-фан-аутом, email шлётся как обычно', ...);
```

> **Решение recipient → userId:** `DispatchRecipient` сейчас `{ email, name?, kind }` без `userId`. Добавить опциональное `userId?: string` в `DispatchRecipient`. Push-фан-аут собирает `userIds` из получателей, у кого `userId` задан. **Это требует прокинуть `userId` в 5 call-sites — НО только как опциональное поле, обратносовместимо.** Альтернатива без правки call-sites: sender резолвит userId по email через IAM. Для v1 берём **опциональное `userId` в `DispatchRecipient`** + минимальную правку каждого listener-а добавить `userId` к recipient (у них уже есть learner-id/iam-link под рукой). Это честнее, чем email→userId-резолв, и оставляет вызовы `dispatch(...)` структурно теми же.

- [ ] **Step 3: Run** → FAIL.

- [ ] **Step 4: Реализация.** В `DispatchInput.recipients` тип `DispatchRecipient` + `userId?`. В конструктор `NotificationDispatcher` добавить `@Inject(WEB_PUSH_SENDER) private readonly pushSender: WebPushSenderPort`. В конце `dispatch()` (после цикла email):

```ts
const userIds = input.recipients.map((r) => r.userId).filter((id): id is string => Boolean(id));
if (userIds.length > 0) {
  await this.pushSender.sendToUsers(input.tenantId, userIds, toPushNotification(rendered));
}
```

(ранний `dedupKey`-return остаётся выше — push при дедупе не шлётся.)

- [ ] **Step 5: Прокинуть `userId` в 5 call-sites.** В каждом listener/scanner, где формируется `recipients: [{ email, name, kind }]`, добавить `userId` (учеников — их IAM-link/userId; найти по образцу как они уже резолвят имя/email). Если у какого-то источника userId недоступен — оставить без него (push просто не уйдёт, email уйдёт). Файлы: `enrollment-email.listener.ts`, `recertification-scanner.service.ts`, `course-deadline-scanner.service.ts`, `document-revoked-email.listener.ts`.

- [ ] **Step 6: Run** (dispatcher + mapping тесты, изолированно) → PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/communication/
git commit -m "feat(backend): push channel seam in NotificationDispatcher (fan-out email+push, dormant Noop)"
```

**Acceptance:** при Noop-sender email-поведение байт-в-байт прежнее (существующие dispatcher-тесты зелёные); при включённом push — `sendToUsers` зовётся с корректным title/body; dedup-скип не шлёт push; 5 call-sites компилируются.

---

### Task 7: Self-service push-эндпоинты + DTO + контроллер (TDD)

**Files:**

- Create: `apps/backend/src/modules/communication/web-push/web-push.controller.ts`
- Create: `apps/backend/src/modules/communication/web-push/web-push.dto.ts` (+ dto-validation test)
- Test: `apps/backend/src/modules/communication/web-push/web-push.http.integration.test.ts` (permission boundary — TenantGuard-only, нет 403-по-праву; стаб-контроллер по образцу `mvp.http.integration.test.ts`)

> **Доступ:** `@Controller('web-push') @UseGuards(TenantGuard)` — БЕЗ `@RequirePermissions` (D-C3, как `NotificationsController`). Все операции скоупятся по `ctx.userId`.

- [ ] **Step 1: DTO** (`web-push.dto.ts`):

```ts
import { Type } from 'class-transformer';
import { IsObject, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';

class PushSubscriptionKeysDto {
  @IsString() @MinLength(1) p256dh!: string;
  @IsString() @MinLength(1) auth!: string;
}

/** POST /web-push/subscribe — браузерный PushSubscription.toJSON(). */
export class SubscribePushRequest {
  @IsString() @MinLength(1) endpoint!: string;

  @IsObject()
  @ValidateNested()
  @Type(() => PushSubscriptionKeysDto)
  keys!: PushSubscriptionKeysDto;

  @IsOptional() @IsString() userAgent?: string;
}

/** DELETE /web-push/subscribe — отписка по endpoint. */
export class UnsubscribePushRequest {
  @IsString() @MinLength(1) endpoint!: string;
}
```

DTO-тесты: валидный `SubscribePushRequest` проходит; без `keys.auth` — ошибка; пустой `endpoint` — ошибка.

- [ ] **Step 2: Контроллер** (`@UseInterceptors(MvpRequestPersistenceInterceptor)` — т.к. пишем в MVP-state; свериться с другими MVP-контроллерами по точному набору интерсепторов):

```ts
@Controller('web-push')
@UseGuards(TenantGuard)
export class WebPushController {
  // GET  /web-push/public-key  → { enabled, publicKey }
  // GET  /web-push/subscriptions → listForUser
  // POST /web-push/subscribe  → assertValidDto(SubscribePushRequest) → service.subscribe
  // DELETE /web-push/subscribe → assertValidDto(UnsubscribePushRequest) → service.unsubscribe
}
```

`public-key` возвращает `{ enabled: backendEnv.WEB_PUSH_ENABLED, publicKey: backendEnv.WEB_PUSH_ENABLED ? backendEnv.VAPID_PUBLIC_KEY ?? null : null }`.

- [ ] **Step 3: HTTP integration** — boot минимального Nest-app со стаб-контроллером (паттерн `mvp.http.integration.test.ts`): без токена/tenant → 401/403 (TenantGuard); с валидным контекстом → 200 и операция скоупится по userId; **подтвердить, что НЕТ permission-гейта** (любой аутентифицированный tenant-user может подписаться).

- [ ] **Step 4: Run** (dto + http integration, изолированно) → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/communication/web-push/web-push.controller.ts apps/backend/src/modules/communication/web-push/web-push.dto.ts apps/backend/src/modules/communication/web-push/web-push.http.integration.test.ts
git commit -m "feat(backend): web-push self-service endpoints (subscribe/unsubscribe/list/public-key, TenantGuard-only)"
```

**Acceptance:** DTO-валидация и permission-boundary (TenantGuard-only, без RBAC) зелёные; `public-key` отражает `WEB_PUSH_ENABLED`.

---

### Task 8: Wire-up модуля + DI (sender по WEB_PUSH_ENABLED)

**Files:**

- Modify: `apps/backend/src/modules/communication/communication.module.ts`
- Modify: тест модуля/бутстрапа, если есть smoke `communication.service.test.ts` — подтвердить, что провайдеры резолвятся (иначе пропустить).

- [ ] **Step 1: Провайдеры.** В `communication.module.ts`:
  - `WebPushController` в `controllers`.
  - `PushSubscriptionService` в `providers`.
  - `WEB_PUSH_SENDER` — `useFactory`, выбирающий `WebPushSender` при `backendEnv.WEB_PUSH_ENABLED` иначе `NoopWebPushSender` (зеркало `MAILER` factory). `WebPushSender` инжектит `PushSubscriptionService`.
  - Убедиться, что `NotificationDispatcher` получает `WEB_PUSH_SENDER` (provider в том же модуле; экспорт уже есть).
  - **MVP-state доступ:** `PushSubscriptionService` (`Scope.REQUEST`, инжектит `MVP_STATE`) — подтвердить, что `MVP_STATE`-токен виден `CommunicationModule` (проверить, как `MVP_STATE` экспортируется/импортируется; если он в MVP-module — добавить `imports: [MvpModule]` или вынести токен. Свериться, как другие коммуникейшн-листенеры читают MVP-данные сейчас, через `Grep MVP_STATE apps/backend/src/modules/communication`).

- [ ] **Step 2: Проверка** — `pnpm typecheck` + (если есть) smoke-тест модуля → PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/modules/communication/communication.module.ts
git commit -m "feat(backend): wire web-push module (sender factory by WEB_PUSH_ENABLED, push subscription service)"
```

**Acceptance:** DI резолвится (typecheck + smoke); при `WEB_PUSH_ENABLED=false` поднимается `NoopWebPushSender`.

---

### Task 9: PWA web app manifest + плейсхолдер-иконки

**Files:**

- Create: `apps/frontend/app/manifest.ts` (App Router metadata route → `/manifest.webmanifest`)
- Create: `apps/frontend/public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (плейсхолдеры)
- Create: `apps/frontend/public/icons/README.md` (пометка: заменить реальными ассетами)
- Modify: `apps/frontend/app/layout.tsx` (если нужно — `themeColor`/`appleWebApp` в metadata; manifest подхватывается автоматически metadata-route-ом)

- [ ] **Step 1: Иконки-плейсхолдеры.** Сгенерировать простые PNG (сплошной бренд-цвет + буква «П»/логотип-заглушка) скриптом, чтобы build не падал. В PowerShell через .NET `System.Drawing` ИЛИ через node-скрипт (sharp не в deps — проще нарисовать минимальный валидный PNG). Допустимо однотонное полотно нужных размеров (192, 512, 512-maskable). Зафиксировать в `public/icons/README.md`, что это плейсхолдеры.

- [ ] **Step 2: manifest.ts** (App Router):

```ts
import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'CDOProf — Личный кабинет',
    short_name: 'CDOProf',
    description: 'Платформа дистанционного обучения CDOProf',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#0b5cab',
    lang: 'ru',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable'
      }
    ]
  };
}
```

- [ ] **Step 3: Проверка** — `pnpm --filter @cdoprof/frontend build` (или dev-build) → manifest-route компилируется, иконки на месте. ESLint по `app/manifest.ts` clean.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/app/manifest.ts apps/frontend/public/icons/
git commit -m "feat(frontend): PWA web app manifest + placeholder icons"
```

**Acceptance:** build генерирует `/manifest.webmanifest`; иконки резолвятся (нет 404 в build-логе); README помечает плейсхолдеры.

---

### Task 10: Serwist service worker (app-shell precache)

**Files:**

- Modify: `apps/frontend/package.json` (deps: `@serwist/next`, `serwist`)
- Modify: `apps/frontend/next.config.ts` (обернуть в `withSerwist`)
- Create: `apps/frontend/src/app/sw.ts` (исходник SW)
- Modify: `apps/frontend/tsconfig.json` (если Serwist требует `lib: ["webworker"]` для SW — следовать доке Serwist; обычно отдельный `tsconfig`/типы `@serwist/next/typings`)
- Modify: `apps/frontend/.gitignore` (игнор сгенерированного `public/sw.js` если Serwist пишет туда)

> **D-C1.** Подтвердить актуальную форму интеграции по доке `@serwist/next` (на момент написания: `withSerwist({ swSrc: 'src/app/sw.ts', swDest: 'public/sw.js' })` + `defaultCache` из `@serwist/next/worker`). Offline-навигация курсов НЕ настраивается (out of scope) — только app-shell/static precache из дефолтного манифеста + дефолтные runtime-кэш-стратегии Serwist.

- [ ] **Step 1: Установить** `pnpm --filter @cdoprof/frontend add @serwist/next serwist`.

- [ ] **Step 2: `src/app/sw.ts`** — минимальный Serwist SW по доке: `Serwist` с `precacheEntries: self.__SW_MANIFEST`, `precacheOptions`, `skipWaiting`, `clientsClaim`, `navigationPreload: true`, `runtimeCaching: defaultCache`. **Push-хендлеры добавит Task 12** (этот таск — только app-shell).

- [ ] **Step 3: `next.config.ts`** — импортировать `withSerwist` из `@serwist/next`, обернуть существующий `nextConfig` (сохранить текущие `rewrites` для SCORM!). Конфиг Serwist отключён в dev по умолчанию (`disable: process.env.NODE_ENV === 'development'`) — это нормально, не мешает разработке.

- [ ] **Step 4: Проверка** — `pnpm --filter @cdoprof/frontend build` → SW генерируется в `public/sw.js`, нет ошибок компиляции; `pnpm typecheck` PASS (SW-типы изолированы). ESLint по `src/app/sw.ts` / `next.config.ts` clean (могут понадобиться eslint-disable для webworker-globals — минимально).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/package.json pnpm-lock.yaml apps/frontend/next.config.ts apps/frontend/src/app/sw.ts apps/frontend/tsconfig.json apps/frontend/.gitignore
git commit -m "feat(frontend): Serwist service worker (app-shell precache, Next 15 App Router)"
```

**Acceptance:** prod-build выдаёт `public/sw.js`; существующие SCORM-rewrites сохранены; typecheck PASS.

---

### Task 11: Frontend push feature-модуль — чистая логика + API-клиент (TDD)

**Files:**

- Create: `apps/frontend/src/features/push/types.ts`
- Create: `apps/frontend/src/features/push/push-logic.ts` (чистые функции)
- Create: `apps/frontend/src/features/push/api.ts`
- Test: `apps/frontend/src/features/push/push-logic.test.ts`
- Test: `apps/frontend/src/features/push/api.contract.test.ts`

- [ ] **Step 1: Failing tests — push-logic.test.ts** (чистые функции):

```ts
it('urlBase64ToUint8Array: декодирует VAPID public key в Uint8Array нужной длины (65 байт для P-256)', ...);
it('urlBase64ToUint8Array: добавляет padding и заменяет -_ на +/', ...);
it('serializeSubscription: PushSubscription.toJSON()-форма → { endpoint, keys:{p256dh,auth} } для POST', ...);
it('isPushSupported: false если нет serviceWorker/PushManager в переданном объекте окружения', ...);
```

(`isPushSupported(env)` принимает мок-объект с полями `serviceWorker`/`PushManager` — чтобы тестировать без `window`.)

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Реализация:**
  - `urlBase64ToUint8Array(base64String)` — стандартный конвертер VAPID-ключа (padding + `-_`→`+/` + `atob` → `Uint8Array`).
  - `serializeSubscription(sub: PushSubscriptionJSON)` → `{ endpoint, keys: { p256dh, auth } }`.
  - `isPushSupported(env)` — `'serviceWorker' in env && 'PushManager' in env`.
  - `types.ts` — зеркало контрактов (`SubscribePushRequest`, `PublicKeyResponse { enabled, publicKey }`).

- [ ] **Step 4: api.ts** — обёртки над `apiRequest`: `getPublicKey(session) → GET /web-push/public-key`; `subscribe(session, body) → POST /web-push/subscribe`; `unsubscribe(session, endpoint) → DELETE /web-push/subscribe`; `listSubscriptions(session) → GET /web-push/subscriptions`. Заголовок `x-tenant-id` как в других фичах.

- [ ] **Step 5: api.contract.test.ts** — `vi.stubGlobal('fetch', ...)`, проверить envelope-unwrap `{data,meta}`, корректные URL/методы/body/`x-tenant-id` для всех 4 вызовов (минимум `getPublicKey` + `subscribe`).

- [ ] **Step 6: Run** → PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/push/types.ts apps/frontend/src/features/push/push-logic.ts apps/frontend/src/features/push/api.ts apps/frontend/src/features/push/push-logic.test.ts apps/frontend/src/features/push/api.contract.test.ts
git commit -m "feat(frontend): push feature - pure logic (VAPID base64→Uint8Array, serialize) + api client"
```

**Acceptance:** конвертер и сериализация покрыты; contract-тесты подтверждают envelope + пути.

---

### Task 12: SW push/notificationclick хендлеры + frontend subscription UI

**Files:**

- Modify: `apps/frontend/src/app/sw.ts` (добавить `push` + `notificationclick` listeners)
- Create: `apps/frontend/src/features/push/hooks.ts` (`usePushSubscription` — `useState`+async, НЕ React Query mutations)
- Create: `apps/frontend/src/features/push/screens.tsx` (`PushSettingsScreen` / секция в настройках)
- Create: `apps/frontend/app/admin/settings/notifications/page.tsx` ИЛИ встроить в существующую страницу настроек (проверить, есть ли страница настроек уведомлений; иначе создать минимальную под `<ProtectedPage>`)

- [ ] **Step 1: SW push-хендлеры** в `src/app/sw.ts`:

```ts
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'CDOProf', {
      body: data.body ?? '',
      icon: '/icons/icon-192.png',
      data: { url: data.url ?? '/' }
    })
  );
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(event.notification.data?.url ?? '/'));
});
```

(payload-форма совпадает с `WebPushSender` JSON из Task 5.)

- [ ] **Step 2: hooks.ts — `usePushSubscription(session)`:**
  - читает `getPublicKey` → если `enabled=false`, экспонирует `supported: false` (UI скрыт).
  - `subscribe()`: `Notification.requestPermission()` → `navigator.serviceWorker.ready` → `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) })` → `serializeSubscription` → `api.subscribe`.
  - `unsubscribe()`: `pushManager.getSubscription()` → `sub.unsubscribe()` + `api.unsubscribe(endpoint)`.
  - состояние: `permission`, `isSubscribed`, `loading`, `error` (через `useState`; паттерн `useDomainMutations.wrap`).

- [ ] **Step 3: PushSettingsScreen** — `SectionCard` «Push-уведомления»: если `!supported` → `SectionEmpty` («Push-уведомления недоступны: не настроены администратором или не поддерживаются браузером»); иначе тумблер «Включить push» (subscribe) / «Отключить» (unsubscribe), статус разрешения, `FieldError`/`SectionError` на ошибки. `'use client'`.

- [ ] **Step 4: Страница.** Проверить существующую страницу настроек уведомлений (`Grep "settings/notifications\|email-templates" apps/frontend/app`). Встроить `PushSettingsScreen` туда; если нет — создать `app/admin/settings/notifications/page.tsx` под `<ProtectedPage>` (доступ — see Task 13).

- [ ] **Step 5: Проверка** — `pnpm typecheck` + ESLint затронутых файлов + `pnpm --filter @cdoprof/frontend build` (SW с push-хендлерами компилируется). НЕ пишем render-тестов на компонент/SW (конвенция).

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/app/sw.ts apps/frontend/src/features/push/hooks.ts apps/frontend/src/features/push/screens.tsx apps/frontend/app/
git commit -m "feat(frontend): SW push/notificationclick handlers + push subscription settings UI"
```

**Acceptance:** build с SW push-хендлерами зелёный; UI скрывается при `enabled=false`; typecheck/ESLint clean.

---

### Task 13: Навигация + e2e (route-access + dynamic-import smoke)

**Files:**

- Modify: `apps/frontend/src/features/navigation/model.ts` (`routeMeta` + `navigationModel` для страницы настроек push, если новая)
- Create: `apps/frontend/src/e2e/push.e2e.test.ts`
- Reference: `apps/frontend/src/e2e/canonical-e2e-readiness.e2e.test.ts`, любой `*.e2e.test.ts` с route-access

- [ ] **Step 1: Навигация.** Если создавалась новая страница настроек — добавить `routeMeta` (доступ: любой аутентифицированный пользователь — push self-service; зеркалить политику доступа inbox-уведомлений, минимальную) + `navigationModel` (раздел «Настройки» / «Уведомления»). Если встроено в существующую страницу — этот шаг пропустить.

- [ ] **Step 2: e2e тесты** (конвенция: НЕ render; route-access + чистые пайплайны + dynamic-import smoke):
  1. Route access: страница настроек push доступна аутентифицированному пользователю (фиксирует контракт `routeMeta`).
  2. Навигация: пункт виден соответствующей роли (`getVisibleNavigation`).
  3. Pipeline: `urlBase64ToUint8Array(<known VAPID key>)` → корректная длина/первый байт; `serializeSubscription(<fixture>)` → ожидаемая форма POST-body.
  4. Dynamic-import smoke: `await import('../features/push/api')`, `('../features/push/push-logic')`, `('../features/push/screens')` — загружаются (если `screens` тянет браузерные API на верхнем уровне — обернуть импорт в try или ограничиться api+push-logic с комментарием; SW (`src/app/sw.ts`) НЕ импортировать в node — он webworker-only).

- [ ] **Step 3: Полный frontend-прогон** — `pnpm test:frontend` (работает на этой машине). Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/features/navigation/model.ts apps/frontend/src/e2e/push.e2e.test.ts
git commit -m "test(frontend): push e2e - route access, VAPID/serialize pipeline, module smoke + navigation"
```

**Acceptance:** route-access и pipeline-тесты зелёные; полный `pnpm test:frontend` PASS.

---

### Task 14: Верификация (изолированные backend-прогоны, lint, typecheck)

**Files:** —

- [ ] **Step 1: Backend изолированные прогоны** (полный backend-suite на Windows/Cyrillic падает — НЕ запускать целиком), каждый с `--no-file-parallelism`:
  - `src/env.schema.test.ts`
  - `src/modules/communication/web-push/*.test.ts` (keys, push-subscription.service, web-push-sender.service, template-push-mapping, web-push.dto, web-push.http.integration)
  - `src/modules/communication/notification-dispatcher.service.test.ts`
  - Expected: PASS.

- [ ] **Step 2: Frontend** — `pnpm test:frontend` + `pnpm --filter @cdoprof/frontend build` (PWA manifest + SW). Expected: PASS.

- [ ] **Step 3: Lint + typecheck монорепо** — `pnpm typecheck` (8/8) и `pnpm lint`. Свои файлы — `npx eslint <paths> --max-warnings=0`. Pre-existing падения вне наших файлов не блокируют.

- [ ] **Step 4: Manual/deferred verification (зафиксировать в handoff, НЕ автоматизируем):**
  - Реальная регистрация SW + установка PWA (Lighthouse/devtools) — ручная, нет DOM-окружения в тестах.
  - Реальный push end-to-end (включить `WEB_PUSH_ENABLED=true` + VAPID + триггернуть Phase 5 событие → браузерное уведомление) — ручная проверка после деплоя.

- [ ] **Step 5: Commit** (если были мелкие фиксы по верификации; иначе пропустить).

**Acceptance:** все целевые backend-файлы и весь frontend-suite зелёные; typecheck 8/8; frontend build (manifest+SW) успешен.

---

### Task 15: Документация и закрытие сессии

**Files:**

- Modify: `README.md` §2 «AI Agent State» (Current Stage / Last Completed / Current / Next / Last Updated At / By)
- Modify: `LMS_AGENT_HANDOFF.md` — добавить `### 5.122` (следующий после 5.121): summary, файлы, тестовый статус, отклонения (Serwist, no-migration MVP-state, TenantGuard-only без RBAC, channel-seam, VAPID-через-эндпоинт, плейсхолдер-иконки)
- Modify: `docs/superpowers/plans/2026-06-13-phase-10c-pwa-push.md` — проставить `- [x]` выполненным шагам
- Modify: `docs/superpowers/PLANS_STATUS.md` — строка Phase 10 Track C со статусом и PR (формат по соседним строкам)
- Modify: `docs/operations-runbook.md` (или `infra/server-setup.md`) — как сгенерировать VAPID (`npx web-push generate-vapid-keys`), что выставить `WEB_PUSH_ENABLED=true` + `VAPID_*` для включения push; что иконки PWA — плейсхолдеры (заменить реальными перед публичным релизом); same-origin push не требует доп. Caddy-правил (push идёт от push-сервиса к SW; subscribe-POST уже через `/api/v1/*`)

- [ ] **Step 1: Внести правки во все файлы выше.**
- [ ] **Step 2: Commit**

```bash
git add README.md LMS_AGENT_HANDOFF.md docs/ infra/
git commit -m "docs: Phase 10 Track C handoff 5.122 + README s2 + plan checkboxes + web-push runbook"
```

**Acceptance:** README §2 и handoff §5.122 отражают завершённую работу; runbook описывает включение push и плейсхолдер-иконки.

---

## Open questions (с рекомендованным дефолтом — реализация не блокируется)

1. **`userId` в `DispatchRecipient` vs email→userId резолв в sender.** Рекоменд. дефолт: **добавить опциональное `DispatchRecipient.userId`** и прокинуть его в 5 call-sites (Task 6 Step 5) — структура вызовов `dispatch()` остаётся прежней, без скрытого IAM-lookup. Если у какого-то источника userId недоступен — push для него тихо пропускается, email уходит. (Tradeoff задокументирован в Task 6.)

2. **Доставка VAPID public key — эндпоинт vs `NEXT_PUBLIC_` env.** Рекоменд. дефолт: **эндпоинт `GET /web-push/public-key`** (D-C5) — рантайм-чтение из backend-env, не требует пересборки фронта, отражает `WEB_PUSH_ENABLED`. (Альтернатива `NEXT_PUBLIC_VAPID_PUBLIC_KEY` дешевле, но дублирует ключ и требует ребилда при ротации.)

3. **Персистентность подписок: MVP-state vs выделенная postgres-таблица.** Рекоменд. дефолт: **MVP-state (`pushSubscriptions`)** (D-C2) — консистентно с кодовой базой, no-migration. В prod (postgres-драйвер) переживает рестарт; в memory-режиме — нет, но браузер переподпишется. Выделенную таблицу делать только если появится требование к долгоживущим подпискам/аналитике доставки push.

4. **Serwist dev-режим.** Рекоменд. дефолт: **`disable` SW в development** (`NODE_ENV==='development'`) — стандартная практика, чтобы SW-кэш не мешал HMR. SW проверяется prod-билдом (Task 10/14).

5. **Плейсхолдер-иконки.** Рекоменд. дефолт: **простые однотонные PNG-плейсхолдеры** (192/512/maskable) + README-пометка; реальные ассеты бренда владелец поставляет позже, заменяются без изменения кода.

6. **Куда поместить UI подписки.** Рекоменд. дефолт: **встроить `PushSettingsScreen` в существующую страницу настроек уведомлений**, если она есть; иначе создать `app/admin/settings/notifications/page.tsx`. Доступ — любой аутентифицированный пользователь (self-service), без нового права.

## Self-review (выполнен при написании плана)

- **Покрытие §11 спеки (Track C):** manifest+иконки → Task 9; Serwist SW (app-shell) → Tasks 10/12; `web-push` dep + VAPID env → Task 1; коллекция `pushSubscriptions` → Task 2; канал «push» в `notification-dispatcher` рядом с email → Task 6; привязка к событиям Phase 5 → Task 6 Step 5 (5 call-sites + `userId`); subscription UI → Tasks 11/12; offline-контент курсов — явно OUT (Architecture).
- **Безопасность мёрджа (dormant):** `WEB_PUSH_ENABLED=false` по умолчанию → `NoopWebPushSender` → `dispatch()` email-поведение байт-в-байт прежнее; `public-key` отдаёт `enabled:false` → UI подписки скрыт; Serwist `disable` в dev. Ничего не активно до явного включения ops-ом.
- **Без миграции, без нового права:** D-C2 (MVP-state) + D-C3 (TenantGuard-only как `NotificationsController`) → миграция 0052 не трогается, новый номер не нужен.
- **Конвенции:** MVP-коллекция зарегистрирована (Task 2 Step 3); env boolean — custom-parse не `z.coerce.boolean` (Task 1); DTO + `assertValidDto` (Task 7); тесты — чистые функции + contract + e2e route/smoke, без render/runtime-SW (Tasks 3,5,11,13); ручная SW/push-проверка явно отложена (Task 14 Step 4).
- **Точки верификации исполнителем в живом коде** (факты, не плейсхолдеры): актуальная форма `@serwist/next` интеграции (Task 10), видимость `MVP_STATE`-токена из `CommunicationModule` (Task 8), точный набор интерсепторов MVP-контроллера (Task 7), наличие существующей страницы настроек уведомлений (Tasks 12/13), как 5 listener-ов резолвят `userId` получателя (Task 6 Step 5), форма audit-вызова (копировать из соседнего MVP-сервиса).
