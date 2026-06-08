# Production auth readiness (magic-link email + password-login hygiene): дизайн

| Поле          | Значение                                                                                                                     |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Дата создания | 2026-06-08                                                                                                                   |
| Автор         | Brainstorming session (владелец учебного центра + Claude)                                                                    |
| Статус        | Утверждён владельцем (design approved 2026-06-08)                                                                            |
| Релиз         | Post-Phase-0 (разблокирует работающий + безопасный пилотный вход)                                                            |
| Источник      | Phase 0 findings A/B — [phase-0 spec §...](2026-06-08-phase-0-pilot-launch-foundation-design.md), `infra/bootstrap-admin.md` |
| Следующий шаг | План реализации (`superpowers:writing-plans`)                                                                                |

> **Назначение.** Работа по деплою (Phase 0) вскрыла два факта об аутентификации, которые тесты не ловят, но которые ломают/делают небезопасным реальный пилот: **(A)** вход по magic-link в проде НЕ отправляет письмо (заглушка `LoggingMagicLinkEmailSender` пишет ссылку только в лог), **(B)** парольный вход `/auth/login` открыт, а seed-пользователи (миграция 0010) имеют публично известный пароль `Password123!`. Этот документ фиксирует: реальное состояние кода и решение — A) доставлять magic-link через существующий почтовый слой; B) **оставить** парольный вход (решение владельца), но автоматически обезвреживать утёкший seed-хеш в проде.

---

## 1. Реальность кода (переиспользуем)

| Возможность                                                                                                                                                | Где                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `interface MagicLinkEmailSender { sendMagicLink({email, rawToken}) }` + `buildMagicLinkUrl()` + заглушка `LoggingMagicLinkEmailSender` (log-only)          | [iam/services/magic-link-email-sender.ts](../../../apps/backend/src/modules/iam/services/magic-link-email-sender.ts) |
| Провайдер `MAGIC_LINK_EMAIL_SENDER` = `useClass: LoggingMagicLinkEmailSender`                                                                              | [iam/iam.module.ts:42](../../../apps/backend/src/modules/iam/iam.module.ts)                                          |
| Почтовый слой: `interface MailerService { send(EmailMessage): SendResult }`, `MAILER` токен, `SmtpMailer`, `NoopMailer`                                    | [infrastructure/mailer/](../../../apps/backend/src/infrastructure/mailer/)                                           |
| Паттерн factory «SmtpMailer если `NOTIFICATIONS_EMAIL_ENABLED`, иначе NoopMailer»                                                                          | [communication.module.ts:50](../../../apps/backend/src/modules/communication/communication.module.ts)                |
| `POST /auth/login` (throttle 25/min, без env-гейта) + `POST /auth/magic-link/{request,redeem}`                                                             | [iam/auth.controller.ts:60](../../../apps/backend/src/modules/iam/auth.controller.ts)                                |
| Seed: tenant `tenant_demo` + админ-юзеры с общим хешем `d845591b855ba5b9a20db65eee522f76ed85858551b8f813ef146725e1a59264` (= `sha256("pwd:Password123!")`) | [migrations/0010](../../../apps/backend/migrations/0010_iam_role_permissions_and_seed.sql), 0038                     |
| `DatabaseService` (запросы) + аудит-паттерн; `OnApplicationBootstrap` доступен в Nest                                                                      | infrastructure / common                                                                                              |

**Вывод:** интерфейсы и почтовый слой готовы. Не хватает: (A) email-реализации sender'а + выбора по флагу; (B) прод-хука гигиены утёкшего хеша.

---

## 2. A — доставка magic-link по почте

### 2.1 Новый `EmailMagicLinkEmailSender`

Реализует `MagicLinkEmailSender`; в конструктор инжектится `MailerService`. `sendMagicLink({email, rawToken})`:

1. `url = buildMagicLinkUrl(rawToken)` (переиспользуем).
2. `await mailer.send({ to: email, subject: 'Вход в CDOProf', body: <текст с url + «ссылка действует 15 минут»>, templateKey: 'magic_link' })`.
3. Если `send()` вернул `failed` — пробросить ошибку (вход без письма бессмысленен; лучше явная ошибка, чем «status: sent» без письма). `skipped_noop` (почта выключена) — не ошибка (dev).

Текст письма — простой русский (без шаблонной системы Phase 5; YAGNI). Тема + одна ссылка + срок.

### 2.2 Выбор реализации по флагу (зеркало communication.module)

В `iam.module.ts` заменить `useClass: LoggingMagicLinkEmailSender` на factory на токене `MAGIC_LINK_EMAIL_SENDER`:

```
useFactory: () =>
  backendEnv.NOTIFICATIONS_EMAIL_ENABLED
    ? new EmailMagicLinkEmailSender(new SmtpMailer({ host, port, from, user?, password? }))
    : new LoggingMagicLinkEmailSender()
```

(Конструирование `SmtpMailer` — то же, что в communication.module; допустимая малая дупликация. Опц. улучшение — вынести общий `MailerModule`/factory; не обязательно для объёма.)

**Итог:** прод (`NOTIFICATIONS_EMAIL_ENABLED=true`, уже в `.env.production.example`) → ссылка приходит на почту. Dev/тест → log-only, без изменений.

---

## 3. B — парольный вход остаётся, утёкший хеш обезврежен (решение владельца)

`POST /auth/login` **остаётся включён** (владелец выбрал «оставить, но защитить»). Безопасность достигается **автоматическим прицельным обезвреживанием утёкшего seed-хеша в проде**, а не ручным рунбуком.

### 3.1 Прод-хук гигиены при старте

Новый провайдер (напр. `SeedCredentialHygiene` в IamModule) с `OnApplicationBootstrap`:

- Срабатывает **только при `backendEnv.NODE_ENV === 'production'`** (в dev/test — no-op, чтобы тесты продолжали логиниться под `Password123!`).
- Идемпотентный UPDATE: для всех `iam.users`, у кого `password_hash` РОВНО утёкший `d845591b855…a59264`, заменить `password_hash` на неработоспособное значение (напр. `'disabled:' || encode(gen_random_bytes(32),'hex')`), которое `verifyPassword` гарантированно отвергает (не scrypt-формат и не 64-hex).
- Пишет в аудит (`iam.seed_credentials_neutralized`, кол-во затронутых строк) для трассируемости.
- **Прицельность:** трогаются ТОЛЬКО строки с конкретным утёкшим хешем → реальные пароли не затрагиваются; не зависит от того, какой админ «выбран» владельцем.

### 3.2 Что это даёт

- `Password123!` в проде перестаёт работать **сам по себе**, без ручных шагов (ровно та хрупкость «зависит от рунбука», которую устраняем).
- Парольный вход остаётся рабочим для аккаунтов с РЕАЛЬНЫМ паролем.
- Пилотный админ входит по magic-link (теперь доставляется, §2). Если владелец хочет активно пользоваться паролем — задаёт реальный (рунбук); утёкший в любом случае мёртв.

### 3.3 Рунбук

`infra/bootstrap-admin.md`: ручная блокировка демо-аккаунтов → «подстраховка»; основной механизм — автогигиена (§3.1). Шаг чтения ссылки из логов (§2b) убрать/смягчить: при включённой почте ссылка приходит письмом.

---

## 4. Обработка ошибок и позиция безопасности

- **A:** при `failed` от mailer — ошибка наружу (не делать вид, что письмо ушло). Троттлинг `/auth/magic-link/request` (5/min) уже есть.
- **B:** гигиена fail-safe-идемпотентна; при ошибке UPDATE — лог + аудит, старт приложения не валим (но логируем как критичное, чтобы заметить). Прицельность по хешу исключает затрагивание не-seed аккаунтов.
- Парольный вход сохраняет существующий троттлинг (25/min).

---

## 5. Тестирование

| Уровень                                  | Что проверяем                                                                                                                                                  |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EmailMagicLinkEmailSender` unit         | зовёт `mailer.send` с `to=email`, темой и body, содержащим `buildMagicLinkUrl(rawToken)`; пробрасывает ошибку при `failed`; ок при `skipped_noop`              |
| iam.module factory                       | `NOTIFICATIONS_EMAIL_ENABLED=true` → Email-реализация; `false` → Logging                                                                                       |
| `SeedCredentialHygiene` unit/integration | в prod-режиме обезвреживает строки с утёкшим хешем (идемпотентно, повтор — 0 изменений); в non-prod — no-op; строка с реальным паролем не тронута; пишет аудит |
| auth integration                         | пользователь с реальным паролем логинится; пользователь только с (обезвреженным) seed-хешем — `invalid_credentials`; magic-link request/redeem не затронут     |

Изолированные файлы с `--no-file-parallelism` (Cyrillic-path gotcha, CLAUDE.md).

---

## 6. Вне объёма (осознанно)

- Self-service сброс/смена пароля через UI — отдельная фича.
- Отключение парольного входа — владелец выбрал «оставить».
- Переписывание seed-миграции 0010 (историческая, не трогаем) — обезвреживание делается рантайм-хуком, не миграцией (иначе сломались бы dev/тесты).
- ЕСИА/прочие методы входа (Phase 4).

---

## 7. Открытые операционные задачи

1. Прод-`.env.production`: `NOTIFICATIONS_EMAIL_ENABLED=true` + рабочий `SMTP_*` (уже в шаблоне) — иначе magic-link уйдёт в no-op.
2. Владелец: поставить реальный email пилотному админу (`bootstrap-admin.md` §2a), чтобы получать ссылку.
