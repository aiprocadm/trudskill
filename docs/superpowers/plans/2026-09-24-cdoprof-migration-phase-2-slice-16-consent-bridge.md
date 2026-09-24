# Согласие на ПДн — мост (МГ-C5.1) — Фаза 2, срез 12.1 — план

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking. План утверждён по поручению владельца (правила автономии ТЗ перехода).

**Goal:** ТЗ перехода §6.4 МГ-C5.1 [P0]: поле состояния согласия на карточке (из `learning.consent_facts`) и возможность куратору отметить «бумажное согласие получено» с датой и файлом (мост `legacyConsentEvidence` для переноса CDOPROF «Сдал/Не сдал»).

**Architecture:** Разведка (§5.597): в `consent_facts` нет колонок источника, файла и того, кто отметил; ручки для сотрудника нет вовсе (только `GET consents/learners/:id` под `identity.read` без потребителя на фронте); на карточке согласие не показывается; колонка `learners.consent_status` мёртвая; «мост CDOPROF» существует лишь как функция `legacyConsentEvidence` без импортёра. Один срез:

- миграция `0115_consent_facts_source_evidence.sql`: `source` (`self|paper|legacy|cdoprof`, старые — `self`), `actor_user_id`, `evidence_file_id`;
- `ConsentService.markPaper`: дата подписи → дата согласия, источник `paper`, скан — файл из личного дела (проверяется репозиторием файлов 9.2), действующее не дублируется, юридический журнал + аудит `learning.consent_paper_marked`;
- ручки: `GET consents/learners/:id/status` (`learners.read`), `POST consents/learners/:id/:kind/paper` (`learners.write`);
- карточка: блок согласий словами (действует с даты и откуда / отозвано / нет) и форма «Отметить бумажное согласие» (вид, дата, скан из проверенных файлов).

**Tech Stack:** NestJS, Postgres (`learning.consent_facts`), `LEARNER_FILES_REPOSITORY` (9.2), `@trudskill/ui` (`KeyValueList`, `LookupSelect`, `blockedProps`).

**Spec:** `TZ_TRUDSKILL_CDOPROF_MIGRATION.md` §6.4 МГ-C5.1, §13.2 (перенос «Персональные данные: Сдал/Не сдал» → факт согласия с источником); ФТ-C3.2 (раздельные согласия).

## Global Constraints

- Ручки и права только добавляются; `consent_status` у слушателя не оживляем — источник правды остаётся `consent_facts` (журнал: колонка мёртвая, записать как дрейф).
- Мутация — под `learners.write` (сторож «не под правом смотреть»); новые SQL/строки — с `tenant_id`.
- Импортёр CDOPROF (Фаза 4, K5) положит `source = 'cdoprof'` тем же `insertFact` — здесь только поле и мост.

## Решения (журнал РМ трекера)

- **РМ109.** «Бумажное согласие получено» отмечает сотрудник с `learners.write`; действующее согласие не дублируется, после отзыва бумага отмечается новым фактом. Дата подписи — дата согласия (не «сейчас»).
- **РМ110.** Состояние согласий на карточке читается ручкой под `learners.read` (`…/status`), а не под `identity.read` очереди модерации: куратору доступна карточка, а не модерация.
- **РМ111.** Скан бумажного согласия — файл личного дела (9.2), выбирается из уже проверенных антивирусом; отдельного хранилища и загрузки внутри формы нет.

## Review Focus

1. Слушатель без согласий: карточка говорит «нет», кнопка отметки видна с правом.
2. Дата в будущем или «31.02» — понятный отказ до записи.
3. Скан чужого слушателя по идентификатору — 404, факт не создаётся.
4. Повторная отметка при действующем согласии — без дубля; после отзыва — новый факт с новой датой.
5. Реестр слушателей после отметки показывает «действует» (список читает `consent_facts` напрямую).

---

## Task 1: срез 12.1

**Files:** Create миграция 0115, `consents/consent-paper.service.test.ts`, `learners/learner-consent-block.tsx`; Modify `consents/{consent.ts, consent.repository.ts, postgres-consent.repository.ts, consent.service.ts, consent.controller.ts}`, фронт `consents/{types,api,hooks}.ts`, `learners/learner-profile-section.tsx`, `audit/labels.ts`, `lib/errors/error-text.ts`, снимок MET-001.

- [x] Миграция; служба с тестом; ручки; карточка; сторожа; документация §5.597 (МГ-C5.1 ✅); `pnpm ci:check`, PR, слияние. Отклонение: значение источника переноса — `imported`, а не имя прежней системы (сторож BR-020).
