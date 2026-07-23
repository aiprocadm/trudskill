# ТЗ «Арендная СДО» — Фаза 0 «Фундамент»

> **Источник:** [TZ_TRUDSKILL_ARENDNAYA_SDO.md](../../../TZ_TRUDSKILL_ARENDNAYA_SDO.md) §13 (дорожная карта) — Фаза 0. Живой статус — [docs/TZ_ARENDNAYA_SDO_STATUS.md](../../TZ_ARENDNAYA_SDO_STATUS.md).
> **Статус документа:** черновик на апрув владельца (Павла). **Код не начат.** По правилу ТЗ §13/§15 фаза стартует только после апрува этого плана.
> **Дата:** 2026-07-23.

**Состав фазы (ТЗ §13):** ФТ-D1 (изоляция + тест-суита), ФТ-G2/G3/G5, ФТ-F1 (email включён), Gotenberg в docker-compose. Опционально — ФТ-C3.3 (шифрование ПДн), зависит от решения по **открытому вопросу №7**.

**Критерий приёмки фазы (ТЗ §13):** `test:isolation` в CI зелёный; письма реально уходят; инфраструктура рендера (Gotenberg) поднята. Плюс жёсткие ограничения ТЗ §15: существующие URL / RBAC / контракты `packages/api-contracts` не ломать; миграции только аддитивные и идемпотентные; фаза заканчивается зелёным `pnpm ci:check` + обновлением handoff и статус-трекера.

---

## Актуализация статусов по факту кода (разведка 2026-07-23)

Разведка кода показала, что часть пунктов Фазы 0 **готова больше**, чем значилось в стартовом трекере. Это меняет объём работ (много «добить», мало «строить с нуля»):

| Пункт                     | Было в трекере | Факт кода                                                                                                                                                      | Что реально делать в Фазе 0                                                                                       |
| ------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| ФТ-D1 механизм изоляции   | 🟡             | `TenantGuard` (`common/guards/tenant.guard.ts`) + `enforceTenantScope` (`infrastructure/database/tenant-repository.ts`) — **есть**                             | не трогать механизм; построить **тест-суиту**                                                                     |
| ФТ-D1 `test:isolation`    | нет            | скрипта/файлов нет                                                                                                                                             | **построить** (Task 1)                                                                                            |
| ФТ-D1 tenantId в очередях | gap A1         | в payload envelope **есть** (`worker/src/message-consumer.ts`), но job-типы `document/integration/notification` — no-op (`worker/src/main.ts`)                 | зафиксировать инвариант «каждое сообщение несёт tenantId» тестом; саму обработку рендера оставить Фазе 1 (ЭПИК A) |
| ФТ-G2 rate limiting       | ⬜             | `@nestjs/throttler` глобально (`app.module.ts`) + per-route на `login`/`magic-link`/`refresh` — **есть**; роутов `reset-password`/`verify-email` в проекте нет | добить публичные роуты (`/verify/{qr}`, публичные формы) + тесты (Task 2)                                         |
| ФТ-G3 2FA TOTP            | ⬜             | нет (только задел `AUTH_PROVIDER`/SuperTokens)                                                                                                                 | **построить** для `tenant_admin`/`platform_admin` (Task 5)                                                        |
| ФТ-G5 ClamAV              | 🟡             | код сканера + гейт + флаг **есть** (`infrastructure/antivirus/*`, `ANTIVIRUS_ENABLED`); контейнера в compose нет                                               | добавить контейнер + включить в prod-профиле (Task 3)                                                             |
| ФТ-F1 email               | ⬜             | `SmtpMailer` (nodemailer) + флаг `NOTIFICATIONS_EMAIL_ENABLED` **есть**; часть событий — stub (`mvp.service.ts:4169`)                                          | включить события + прод-SMTP env + добить stub'ы (Task 4)                                                         |
| Gotenberg / рендер        | gap C4         | `render` в `worker/src/document-pipeline.ts` — seam без реализации; Gotenberg нигде нет                                                                        | поднять **контейнер** Gotenberg (Task 6); сам движок рендера — Фаза 1                                             |
| Шифрование ПДн            | 🟡             | СНИЛС/паспорт — plaintext (`migrations/0036_learners_personal_data.sql`); шифрование только для секретов интеграций                                            | **условно** (Task 7), по решению вопроса №7                                                                       |

**Указатель миграций:** последняя — `0059_payments_idempotency_key_unique.sql`. Новые в этой фазе — с `0060`. (Заметка: CLAUDE.md устарел — там указано `0038`.)

---

## Открытый вопрос №7 — блокирует объём Фазы 0 (решение владельца)

**Вопрос (ТЗ §14.7):** шифровать чувствительные поля ПДн (серия/номер паспорта, СНИЛС) на уровне приложения **уже в Фазе 0** или отложить до **Фазы 3** (идентификация)?

**Рекомендация:** сделать **в Фазе 0**. Причина простыми словами: пока в системе живёт только один тенант (свой УЦ) и данных мало, добавить шифрование — недорого. Когда приедут внешние арендаторы с тысячами слушателей, менять формат хранения ПДн задним числом придётся с миграцией зашифрованных данных «на живую» — дороже и рискованнее. Правильнее закрыть до появления арендаторов.

- Решение **«Фаза 0»** → в план входит Task 7.
- Решение **«Фаза 3»** → Task 7 исключается, ФТ-C3.3 остаётся 🟡 в трекере до Фазы 3.

---

## Порядок выполнения (маленькими шагами, каждый — отдельный под-PR)

Параллелятся, но приёмка фазы = все зелёные. Рекомендуемая последовательность по риску/зависимостям:

1. **Task 1** — `test:isolation` (фундамент безопасности аренды, ни от чего не зависит).
2. **Task 3** — ClamAV-контейнер (мелко, инфра).
3. **Task 6** — Gotenberg-контейнер (мелко, инфра, разблокирует Фазу 1).
4. **Task 2** — rate limiting добить (мелко).
5. **Task 4** — email события (средне).
6. **Task 5** — 2FA TOTP (крупнее, самостоятельный).
7. **Task 7** — шифрование ПДн (**только если вопрос №7 = «Фаза 0»**).

---

## Task 1 — ФТ-D1.3: тест-суита изоляции `test:isolation`

**Files:**

- Modify: `package.json` (корень) — добавить скрипт `test:isolation` (vitest project/фильтр по тегу).
- Modify: `apps/backend/package.json` — скрипт-обёртка при необходимости.
- Create: `apps/backend/src/**/*.isolation.test.ts` — матрица тестов изоляции (по образцу `*.http.integration.test.ts` — минимальный Nest-app + stub-контроллер; см. CLAUDE.md «HTTP integration tests»).
- Modify: `.github/workflows/ci.yml` — добавить job/шаг `test:isolation`.
- Reference (не менять): `common/guards/tenant.guard.ts`, `infrastructure/database/tenant-repository.ts`, `apps/worker/src/message-consumer.ts`.

**Tasks:**

- [ ] Инвентаризация доменных read/write/bulk/export/search endpoints (по контроллерам `modules/*`), составить матрицу «endpoint × чужой tenant → ожидание 403/404».
- [ ] Тесты guard-границы: запрос с JWT тенанта A + `x-tenant-id: B` → `tenant_header_mismatch`; запрос к сущности тенанта B по прямому id → 403/404 (негатив на IDOR).
- [ ] Тест инварианта очередей: каждое исходящее сообщение worker-контуров несёт `tenantId` в envelope (unit по `document-pipeline`/`bulk-enrollment-callback`).
- [ ] Скрипт `pnpm test:isolation` собирает только эти файлы; добавить в CI отдельным шагом.
- [ ] (Опционально, помечено в backlog) второй слой — Postgres RLS на read-путях `learners`/`generated_documents` — **вынести в Фазу 4**, здесь только зафиксировать намерение.

**Acceptance:** `pnpm test:isolation` зелёный локально и в CI; матрица покрывает все доменные контроллеры; добавление нового endpoint без tenant-скоупа роняет суиту. URL/RBAC/контракты не изменены.

---

## Task 2 — ФТ-G2: добить rate limiting на публичных роутах

**Files:**

- Modify: `apps/backend/src/modules/documents/public-verify.controller.ts` (или где живёт `/verify/{qr}`) — `@Throttle` с жёстким лимитом (антиперебор токенов).
- Modify: прочие публичные/анонимные формы (если появятся) — точечно.
- Create/Modify: тесты лимитов в стиле `test:security`.
- Reference: `app.module.ts` (глобальный throttler ttl60/limit300), `modules/iam/auth.controller.ts` (образцы per-route `@Throttle`).

**Tasks:**

- [ ] Навесить строгий `@Throttle` на публичную проверку документа `/verify/{qr}` (защита от перебора QR-токенов — ФТ-A6.2).
- [ ] Пройтись по анонимным/публичным endpoints, убедиться что каждый под лимитом (login/magic-link/refresh — уже покрыты, не трогать).
- [ ] Тест: превышение лимита на `/verify` → 429.

**Acceptance:** публичная проверка документа отбивает перебор (429 после лимита); тест в `test:security` зелёный; существующие лимиты auth не изменены.

---

## Task 3 — ФТ-G5: контейнер ClamAV + включение в проде

**Files:**

- Modify: `infra/docker-compose.yml` — сервис `clamav` (образ `clamav/clamav`), порт 3310, healthcheck.
- Modify: `infra/docker-compose.prod.yml` — тот же сервис + `ANTIVIRUS_ENABLED=true` для backend в prod-профиле.
- Modify: `.env.example` / документация env — `ANTIVIRUS_ENABLED`, `CLAMAV_HOST`, `CLAMAV_PORT`.
- Reference (не менять код): `infrastructure/antivirus/clamav-antivirus.scanner.ts`, `modules/files/files.module.ts` (DI-переключатель уже готов).

**Tasks:**

- [ ] Добавить сервис `clamav` в dev-compose (по умолчанию dev остаётся с флагом false — Noop, чтобы не грузить локалку).
- [ ] В prod-compose включить контейнер + `ANTIVIRUS_ENABLED=true`.
- [ ] Проверить healthcheck и что backend стартует после готовности clamav (depends_on).
- [ ] Дымовой тест: загрузка заражённого EICAR-файла в prod-профиле → `file_infected`.

**Acceptance:** в prod-профиле антивирус реально сканирует; EICAR отбивается; dev-профиль не сломан (флаг false → Noop). Код сканера не тронут.

---

## Task 4 — ФТ-F1: включить email по-настоящему

**Files:**

- Modify: `apps/backend/src/modules/mvp/mvp.service.ts` (~:4169) и др. места со stub-письмами — перевести на `MailerService`.
- Modify: `modules/communication/*` — события: приглашение слушателя, назначение на курс, код на экзамен, результат, готовность документов, напоминания о переобучении.
- Modify: `.env.example` / прод-env — `NOTIFICATIONS_EMAIL_ENABLED=true` + `SMTP_*`.
- Reference (готово, не переписывать): `infrastructure/mailer/smtp-mailer.service.ts`, `communication.module.ts` (DI-переключатель), дедуп `0049`.

**Tasks:**

- [ ] Найти все залогированные stub-письма (grep по «e-mail»/«mail rides»/Noop-обходам) и перевести на `MailerService`.
- [ ] Подключить события к диспетчеру уведомлений (приглашение с рабочей invite-ссылкой — сейчас не уходит само).
- [ ] Прод-SMTP env + cross-field валидация уже в `env.schema.ts` — задокументировать заполнение.
- [ ] Тесты: события вызывают `MailerService.send` (мок); при `NOTIFICATIONS_EMAIL_ENABLED=false` — Noop, ничего не падает.

**Acceptance:** с прод-SMTP приглашение слушателя и код на экзамен реально уходят; дедуп работает; юнит-тесты зелёные; выключенный флаг не ломает флоу (Noop).

---

## Task 5 — ФТ-G3: 2FA (TOTP) для `tenant_admin` и `platform_admin`

**Files:**

- Create: `apps/backend/migrations/0060_iam_totp_2fa.sql` — хранение TOTP-секрета (зашифрованного) + флаг «2FA включена» на пользователе; аддитивно, идемпотентно.
- Create: `modules/iam/services/totp.service.ts` (`otplib`) + провязка в login-флоу (шаг ввода кода после пароля).
- Modify: `modules/iam/auth.controller.ts` — эндпоинты `2fa/setup` (QR/secret), `2fa/verify`, `2fa/disable`; логин с включённой 2FA требует второй шаг.
- Create: фронт — экран настройки 2FA в профиле админа + шаг ввода кода при логине.
- Tests: unit сервиса TOTP, http-integration на границу прав, negative на неверный код + rate limit.

**Tasks:**

- [ ] Миграция: колонки `totp_secret_encrypted`, `totp_enabled` (шифрование секрета — тем же application-crypto, что в Task 7 / уже применяется к секретам интеграций).
- [ ] `TotpService`: генерация секрета, otpauth-URL для QR, проверка кода с окном ±1.
- [ ] Login-флоу: если `totp_enabled` — после верного пароля вернуть «нужен 2FA-код», принять код на отдельном шаге.
- [ ] Rate limit на ввод кода (переиспользовать throttler).
- [ ] Обязательность 2FA для `platform_admin` — обсудить (мягко: предупреждение, не блок) на апруве.

**Acceptance:** админ включает 2FA (сканирует QR, подтверждает кодом); при следующем логине без кода не пускает; неверный код лимитируется; обычные роли не затронуты; RBAC/URL не сломаны.

---

## Task 6 — Gotenberg в docker-compose (инфраструктура рендера)

**Files:**

- Modify: `infra/docker-compose.yml` + `infra/docker-compose.prod.yml` — сервис `gotenberg` (`gotenberg/gotenberg:8`), порт 3000 внутренний, healthcheck.
- Modify: `apps/backend/src/env.schema.ts` — `GOTENBERG_URL` (default `http://gotenberg:3000`), опциональный флаг.
- Modify: `.env.example` — `GOTENBERG_URL`.

**Tasks:**

- [ ] Поднять контейнер Gotenberg (LibreOffice внутри) в dev и prod compose.
- [ ] Добавить env `GOTENBERG_URL`, подключить (валидация схемы), healthcheck.
- [ ] Дымовой тест доступности из worker-сети (curl на `/health`).
- [ ] **Сам движок рендера (docxtemplater → Gotenberg → S3) — НЕ здесь, это Фаза 1 / ЭПИК A.** Здесь только инфраструктура готова к подключению.

**Acceptance:** контейнер Gotenberg поднимается и отвечает на healthcheck из сети worker; `GOTENBERG_URL` валидируется схемой; на код рендера пока не влияет.

---

## Task 7 — ФТ-C3.3: шифрование полей ПДн _(условно — только если вопрос №7 = «Фаза 0»)_

**Files:**

- Create: `apps/backend/migrations/0061_learners_pii_encryption.sql` — аддитивные колонки под зашифрованные значения (или пометка формата), идемпотентно.
- Create/Modify: `apps/backend/src/infrastructure/crypto/*` — application-level AES-GCM для полей (по образцу шифрования `secret_encrypted` интеграций), мастер-ключ через env (по аналогии с практикой prt_ot_doc).
- Modify: `modules/mvp/learners-bulk-import.service.ts` и сервисы чтения/записи слушателя — прозрачное шифрование/дешифрование серии/номера паспорта, СНИЛС.
- Tests: round-trip шифрования; выборки/фильтры по СНИЛС по-прежнему работают (или отдельный хэш-индекс для поиска).

**Tasks:**

- [ ] Решить схему: полное шифрование поля + отдельный slepой хэш для точечного поиска/уникальности СНИЛС.
- [ ] Мастер-ключ в env (для прода — свой; в dev — сгенерённый), запрет plaintext в БД.
- [ ] Миграция данных существующих слушателей (их сейчас немного — один свой УЦ).
- [ ] Обновить экспорт в реестры (`0045`/`0046`) — дешифровать на лету при выгрузке.

**Acceptance:** серия/номер паспорта и СНИЛС в БД не в открытом виде; чтение/запись/экспорт работают прозрачно; валидация checksum СНИЛС и выгрузки в реестры не сломаны.

---

## Завершение фазы (обязательно, ТЗ §13/§15 + DOCUMENTATION_MAP §agent-handoff-protocol)

- [ ] `pnpm ci:check` зелёный (lint + typecheck + contracts + test:unit + build).
- [ ] `pnpm test:isolation` зелёный (новый гейт).
- [ ] README §2 «AI Agent State» обновлён (Current Stage / Last / Current / Next / дата / by).
- [ ] `LMS_AGENT_HANDOFF.md` §5.167+ — запись сессии (summary, файлы, тесты, deviations).
- [ ] `docs/TZ_ARENDNAYA_SDO_STATUS.md` — статусы ФТ-D1/G2/G3/G5/F1 (+ C3 при Task 7) переведены в ✅/🟡, журнал сессий дополнен, открытый вопрос №7 отмечен решённым.
- [ ] CLAUDE.md — поправить устаревший указатель последней миграции (0038 → фактический).
