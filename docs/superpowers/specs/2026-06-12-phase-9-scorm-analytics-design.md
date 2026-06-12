# Phase 9: SCORM-импорт + аналитика — дизайн

**Дата:** 2026-06-12
**Статус:** утверждён по делегированию владельца (решения по умолчанию, ревью на уровне PR)
**Roadmap:** `docs/superpowers/plans/2026-05-21-cdoprof-v1-roadmap.md` Phase 9 (SCORM 1.2 плеер, загрузка zip, прогресс через SCORM API, дашборд админа)
**ТЗ:** SDOPROF_TZ_FINAL §28 (SCORM 1.2/2004 = Should), legacy-parity gap #11 (`docs/superpowers/specs/2026-05-30-legacy-parity-roadmap.md`)

## Декомпозиция

Phase 9 = два независимых подпроекта, каждый со своим планом и PR:

- **Plan A — SCORM-импорт и плеер** (этот основной объём спеки, §1–§10).
- **Plan B — дашборд аналитики админа** (§11, краткий скоуп; детали в его плане).

## Контекст (что уже есть)

- SCORM сегодня — заглушка: страница `/scorm` (план из 5 шагов текстом), `'scorm'` в `ProviderType` integrations. Плеера/парсера/библиотек нет.
- Материалы: `materialType: 'file' | 'external_url' | 'text' | 'video'` (`mvp.types.ts`, CHECK-констрейнт в `0002_mvp_domain_model.sql`), диспетчер типов — `apps/frontend/src/features/course-viewer/material-player.tsx`.
- Файловый пайплайн: presigned PUT intents + AV-гейт (`files.service.ts`), но `SUBMISSION_MAX_BYTES = 10MB` — константа, нужен per-purpose override.
- S3-клиент умеет `getObjectStream` / `putObject` (`s3-storage.client.ts`).
- Worker не имеет ни S3-клиента, ни zip-библиотек — асинхронную распаковку через RabbitMQ НЕ делаем (см. решение D3).

## Решения (Plan A)

### D1. Версия стандарта: только SCORM 1.2

SCORM 2004 (sequencing, cmi.\*) — вне скоупа, как в roadmap. Пакет с манифестом 2004 при импорте получает статус `failed` с понятной ошибкой (`scorm_version_unsupported`).

### D2. Плеер: библиотека `scorm-again`

Реализует SCORM 1.2 runtime API (`window.API`) с валидацией модели данных и кодами ошибок. Альтернатива «рукописный адаптер ~8 функций» отклонена: чужие пакеты капризны к деталям error-кодов, scorm-again battle-tested и предложена самим roadmap. Client-only — подключаем через dynamic import.

### D3. Распаковка: синхронно в backend при импорте

`POST /scorm-packages/:id/process` стримит zip из S3 (`unzipper`), валидирует, кладёт каждый entry в S3 под `scorm/<tenantId>/<packageId>/...` через `putObject`. Распакованные файлы НЕ регистрируются в `storage.files` — это derived-контент, единица учёта — пакет (zip остаётся в `storage.files` с AV-вердиктом).

Отклонено: распаковка в worker (нет S3/zip-инфраструктуры — много новых движущихся частей ради редкой операции админа), раздача напрямую из zip (чтение центрального каталога на каждый ассет).

Гарды от zip-bomb и path traversal (чистые функции, юнит-тесты):

- максимум **5000 entries**;
- суммарный несжатый размер ≤ **1.5 ГБ**, один entry ≤ **300 МБ**;
- отказ при `..`, абсолютных путях, backslash-путях, симлинках;
- обязателен `imsmanifest.xml` в корне.

AV-гейт: при `ANTIVIRUS_ENABLED=true` процессинг требует вердикта `clean` у zip (тот же контракт, что download-гейт: pending → lazy scan; infected → 423 `file_infected`).

### D4. Манифест: `fast-xml-parser`, минимальный разбор

Из `imsmanifest.xml` берём: версию схемы (1.2 vs 2004), title организации, **launch href первого item с identifierref → resource href** (+ resource base). Многоуровневые organizations/items НЕ строим в TOC (один SCO на пакет — типовой кейс готовых курсов ОТ/ПБ; multi-SCO — backlog). Парсер — чистая функция `parseScormManifest(xml): { version, title, launchHref }` с юнит-тестами на реальные образцы манифестов.

### D5. Модель данных

Новая MVP-коллекция `scormPackages` (+ регистрация в `mvp-collections.ts`, + миграция по образцу 0051):

```ts
interface ScormPackage extends BaseEntity {
  title: string; // из манифеста, редактируемо
  packageStatus: 'uploaded' | 'processing' | 'ready' | 'failed';
  zipFileId: string; // storage.files (AV-вердикт здесь)
  storagePrefix: string; // scorm/<tenantId>/<id>
  launchHref?: string; // относительный путь точки входа
  manifestTitle?: string;
  entryCount?: number;
  totalBytes?: number;
  error?: string; // код причины failed
}
```

Привязка к материалу: новый `materialType: 'scorm'` + поле `scormPackageId?: string` на `Material`. Миграция: пересоздать CHECK `materials_type_chk` с `'scorm'` + колонка `scorm_package_id` + таблица `learning.scorm_packages`. Материал типа scorm требует `scormPackageId` пакета в статусе `ready` (валидация в сервисе).

Прогресс — новая коллекция `scormAttempts`: по `(enrollmentId, materialId)` единственная запись:

```ts
interface ScormAttempt extends BaseEntity {
  enrollmentId: string;
  materialId: string;
  learnerId: string;
  lessonStatus: 'not attempted' | 'incomplete' | 'completed' | 'passed' | 'failed' | 'browsed';
  lessonLocation?: string;
  suspendData?: string; // ≤ 64KB (SCORM 1.2 лимит 4096, берём с запасом)
  scoreRaw?: number;
  scoreMax?: number;
  scoreMin?: number;
  totalSeconds: number; // суммируем session_time коммитов
  startedAt: string;
  lastCommitAt?: string;
  completedAt?: string;
}
```

### D6. Раздача контента: токен в пути, same-origin через rewrite

- `POST /scorm-materials/:materialId/launch` (учётка ученика, проверка доступа через enrollment как у остальных материалов) → `{ token, launchUrl: "/scorm-content/<token>/<launchHref>", attempt: ScormAttempt }`.
- Токен: HMAC-подписанный payload `{ tenantId, packageId, exp }` (TTL 4 часа), секрет — env `SCORM_CONTENT_TOKEN_SECRET` (dev-default есть, прод-значение в `infra/.env.production.example`).
- `GET /scorm-content/:token/*path` — **без TenantGuard** (iframe не может слать заголовки): валидация подписи/exp → стрим S3-объекта `<storagePrefix>/<path>`, mime по расширению, 404 вне префикса. Тесты на подделку/просрочку токена обязательны.
- Same-origin: фронтенд открывает iframe по **относительному** URL; в dev — rewrite в `next.config` (`/scorm-content/* → backend`), в prod — маршрут в Caddyfile. Без этого SCO не достанет `window.parent.API` (синхронный API ⇒ postMessage-мост невозможен).
- `sandbox="allow-scripts allow-same-origin allow-forms allow-popups"` на iframe.

### D7. Прогресс: commit-эндпоинт + интеграция с materialProgress

- `PUT /scorm-attempts/:id/commit` (учётка ученика, владелец attempt) — принимает снапшот cmi-полей (lesson_status, location, suspend_data, score, session_time), мёрджит в `ScormAttempt`. Идемпотентен, last-write-wins.
- Когда `lessonStatus` становится `passed`/`completed` — сервис помечает materialProgress материала завершённым через существующий механизм прогресса (тот же путь, что у `minViewSeconds`-завершения), один раз (повторные коммиты не дублируют).
- Фронтенд-плеер: scorm-again `Scorm12API` в родительском окне, маппинг cmi ↔ attempt, дебаунс-коммит на `LMSCommit`, финальный — на `LMSFinish` + `beforeunload`. Резюме: при launch отдаём сохранённые `lessonLocation`/`suspendData`, плеер инициализирует ими cmi.

### D8. Загрузка пакета админом

- `FilesService.createUploadIntent` получает опциональный `maxBytes` в options (как уже есть `mimeAllowlist`/`keyPrefix`).
- `POST /scorm-packages/upload-url`: allowlist `application/zip`, `application/x-zip-compressed`, `keyPrefix: 'scorm-packages'`, лимит — env `SCORM_PACKAGE_MAX_BYTES` (default 300 МБ).
- Флоу админа: upload-url → PUT в MinIO → `POST /scorm-packages` (регистрация) → `POST /scorm-packages/:id/process` (синхронная распаковка; фронт показывает спиннер) → `ready`.
- `DELETE /scorm-packages/:id` — запрещён, пока на пакет ссылается материал; удаляет распакованный префикс из S3 (зачистка) + soft-delete записи.

### D9. Права и UI

- Управление пакетами: `materials.write` (контент-менеджмент), список/просмотр: `materials.read`. Новых permissions и migration-сидов НЕ требуется.
- Страница `/scorm` (роут и nav уже существуют с `materials.read`): заглушка заменяется на реестр пакетов (DataTable: title, статус, размер, entries, дата) + загрузка + кнопка «Обработать» + удаление.
- В форме создания материала (CourseDetailsScreen) — опция `scorm` + select пакета (только `ready`).
- Курс-вьюер: `case 'scorm'` в `MaterialPlayer` → `ScormPlayer` (фича `src/features/scorm/`: api.ts, hooks.ts, types.ts, player-логика чистыми функциями + screens.tsx).

### D10. Тесты (по конвенциям репо)

- Юнит: `parseScormManifest`, zip-гарды (entries/size/traversal), токен sign/verify, cmi-маппинг плеера (чистые функции), завершение materialProgress по lessonStatus.
- DTO-валидация: register/process/commit/launch DTO.
- HTTP integration (стаб-контроллер в `mvp.http.integration.test.ts` + отдельный для unguarded `/scorm-content`): permission boundary `materials.read/write`, 401/403, валидный/протухший/подделанный токен.
- Frontend: `api.contract.test.ts` (envelope unwrap), e2e route access (`/scorm` — permission), смоук динамического импорта плеера. Без RTL-render.

## §11. Plan B — дашборд аналитики (скоуп, детали в своём плане)

- **Backend:** `GET /reports/analytics-dashboard` (permission `enrollments.read`, как существующий `/reports/kpi-snapshot`): фильтры `course_id`, `group_id`, `client_id` (counterparty), `enrolled_from/to`; ответ — completion rate, exam pass rate, средний срок прохождения (enrolledAt→completedAt), средний балл, распределение попыток до сдачи (1/2/3+), drop-off (активные без активности > 14 дней), + строки разбивки по курсам и по группам (для drill-down таблиц). Агрегация по паттерну kpi-snapshot/Wave-2 (gather → rows), чистые функции-агрегаторы с юнит-тестами.
- **Frontend:** страница `/admin/analytics` (nav: `enrollments.read`), библиотека **recharts** (рекомендация roadmap); KPI-карточки + 2–3 графика (completion по курсам, распределение попыток) + DataTable-разбивки с FilterBar. Drill-down = выбор фильтра, не модалки.
- Существующий `/reports/kpi-snapshot` не трогаем (обратная совместимость).

## Вне скоупа Phase 9

SCORM 2004 / xAPI / cmi5 / LTI; multi-SCO TOC; асинхронная распаковка через worker; интеграция LContent-тренажёров (контрактное решение владельца); прокторинг-гейт внутри SCORM-материалов (5 гейтов работают на уровне итогового теста, не SCORM); экспорт SCORM-результатов в регуляторные реестры.

## Риски

- **Капризность чужих пакетов** (нестандартные манифесты): парсер бросает типизированные ошибки, пакет уходит в `failed` с кодом — админ видит причину; реальный пакет владельца станет приёмочным тестом после деплоя.
- **Большие zip по медленному каналу:** presigned PUT идёт напрямую в MinIO мимо Node — ок; синхронный process для 300МБ может занять десятки секунд — таймаут запроса поднимем точечно, фронт ждёт со спиннером (повторный вызов process идемпотентен: если `ready` — no-op).
- **Same-origin в prod:** требуется строка в Caddyfile (`/scorm-content/* → backend`) — добавить в infra + runbook, иначе плеер не сможет коммитить прогресс.
