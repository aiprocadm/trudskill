# Приглашение сотрудника (МГ-J3.2) — Фаза 2, срез 8.11 — план

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking. План утверждён по поручению владельца (правила автономии ТЗ перехода).

**Goal:** Администратор приглашает сотрудника из интерфейса (ТЗ перехода МГ-J3.2): `/users` → «Пригласить сотрудника» → дровер (ФИО, почта, роль, должность) → `POST /users/invite` заводит учётку без пароля, выдаёт роли под лимитом сотрудников и отправляет письмо со ссылкой входа (magic-link).

**Architecture:** Бэкенд — одна ручка `POST users/invite` (`iam.manage_roles`) в `AuthController`, оркестрирующая существующие кирпичи: `TenantStaffLimitService.assertCanAddStaff` → `IamService.createUser` (логин = почта, без пароля) → `IamService.setUserRoles` → `MagicLinkService.requestLink` + `MAGIC_LINK_EMAIL_SENDER.sendMagicLink` (то же письмо, что при входе по ссылке) → аудит `iam.user_invited`. «Должность» — новая необязательная колонка `iam.users.position` (миграция 0112) и необязательное поле контракта `UserResponseContract.position` (разрешено правилами автономии). Фронт — `UserInviteDrawer` (`DetailDrawer`), первичное действие «Пригласить сотрудника» на `/users`, колонка «Должность» не добавляется (бюджет), должность видна в карточке.

**Tech Stack:** NestJS, class-validator, `MagicLinkService`, `@trudskill/ui` (`DetailDrawer`, `DrawerCancelButton`, `blockedProps`), `roleNameRu`, vitest.

**Spec:** `TZ_TRUDSKILL_CDOPROF_MIGRATION.md` МГ-J3.2 («экран `/users` → «Пригласить», `POST /users/invite`, письмо … сотрудник получает magic-link, роль назначена»); ТЗ редизайна CMP-010, `TXT-002`.

## Global Constraints

- Права — существующее `iam.manage_roles`; лимит сотрудников (ФТ-D4.2) проверяется до создания учётки; ручка `POST /users` не меняется.
- Письмо — существующий отправитель ссылки входа (без базы/почты — журнальный отправитель, ответ честно говорит «письмо не отправлено — почта на стенде выключена»); ограничение частоты ссылок (3 за 15 минут на адрес) — ответ `invite.status = 'throttled'`.
- Контракт только расширяется необязательным полем `position`; миграция аддитивная.

## Решения (журнал РМ трекера)

- **РМ72.** Логин приглашённого = почта в нижнем регистре (уникальность по центру); пароля нет (`unusablePasswordHash`) — вход только по ссылке на почту; занятые логин/почта — 409 с русским текстом.
- **РМ73.** Письмо приглашения = письмо входа по ссылке (`sendMagicLink`, 15 минут), без нового шаблона `email_templates`: ссылка входа намеренно не идёт через настраиваемые шаблоны (каталог уведомлений), а отдельный шаблон «приглашение» — с МГ-C4.3 (письмо с доступом) в Фазе 6. Просроченную ссылку сотрудник запрашивает сам формой «Вход по ссылке».
- **РМ74.** «Должность» сотрудника — колонка `iam.users.position` (0112) и необязательное поле контракта; в списке `/users` колонка не добавляется (4 колонки, бюджет), должность показывается в карточке сотрудника.
- **РМ75.** Роли в дровере — все роли центра кроме `learner` и `counterparty_rep` (это не сотрудники; для них есть свои пути), флажками с русскими именами; хотя бы одна роль обязательна.

## Review Focus

1. Почта уже занята другой учёткой → 409 с текстом, учётка не создаётся дважды (тест контроллера).
2. Лимит сотрудников исчерпан → 409/402 от `assertCanAddStaff` до создания учётки (тест: заглушка лимита бросает — учётки нет).
3. Ссылка под ограничением частоты → учётка и роли созданы, `invite.status = 'throttled'`, дровер говорит «письмо не ушло: слишком много запросов ссылки — повторите через 15 минут» (тест).
4. Без прав `iam.manage_roles` → 403 (сторож поверхности прав + контрактный тест).
5. Дровер: пустая роль или неверная почта — кнопка объясняет, что не так; закрытие с правками — подтверждение.

---

## Task 1: бэкенд

**Files:** Create `migrations/0112_iam_users_position.sql`; Modify `packages/api-contracts/src/auth/contracts.ts` (+ `position?`), `iam/iam.types.ts`, `iam/services/iam.service.ts` (`position` в выборках, `toUser`, `createUser`, `updateUser`; `findByEmail` для 409), `iam/iam-response.mapper.ts`, `iam/dto/login.dto.ts` (`InviteUserDto`, `position?` в create/update), `iam/auth.controller.ts` (`POST users/invite`), тесты `auth.controller.contract.test.ts` (+2), `iam.dto-validation.test.ts` (+1); фронт `audit/labels.ts` (`iam.user_invited`).

- [x] Тесты → код → lint/typecheck → commit. Отклонение: аудит — существующие `iam.user_created`/`iam.user_roles_updated`, отдельный код `iam.user_invited` не заводился.

## Task 2: фронт

**Files:** Create `features/users/user-invite-drawer.tsx`; Modify `features/users/users-screens.tsx` (первичное действие, дровер, должность в карточке), `features/mvp/{types,api,hooks}.ts` (`inviteUser`), `api.contract.test.ts` (+1), `roles.ru.ts` не меняется.

- [x] Экран; сторожа `src/e2e`, `features/users`, `features/mvp`; commit (поле почты: `inputMode`, `autoComplete`, подсказка без латиницы — по сторожам).

## Task 3: документация 8.11 — [x] сделано (§5.583) — handoff §5.583, трекер (РМ72–РМ75, МГ-J3.2 ✅), README, CLAUDE, план — галочки. `pnpm ci:check`, PR, слияние.
