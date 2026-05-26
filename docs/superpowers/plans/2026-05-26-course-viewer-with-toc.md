# Course Viewer with TOC — закрытие §4.3 (V1 Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Превратить заглушку `LearnerCourseDetailsScreen` в полноценный курс-плеер. Закрывает §4.3 спеки (боль №3): видео/PDF/HTML/text плеер с оглавлением справа, галочки пройденного, блокировка будущих уроков, авто-расчёт `studiedSeconds`.

**Спецификация:** [`docs/superpowers/specs/2026-05-21-cdoprof-redesign-design.md` §4.3](../specs/2026-05-21-cdoprof-redesign-design.md), [`docs/superpowers/plans/2026-05-21-cdoprof-v1-roadmap.md` Phase 1](2026-05-21-cdoprof-v1-roadmap.md).

**Architecture.** Чистый frontend feature — backend (Material, MaterialProgress, listModules, listMaterials, upsertMaterialProgress) уже готов. Расширяем `mvp/api.ts` + создаём `features/course-viewer/*` + перепишем `LearnerCourseDetailsScreen`.

**Tech Stack.** Next.js, React Query, существующая дизайн-система `@cdoprof/ui`. **Никаких новых npm зависимостей** — HTML5 `<video>` для видео, `<iframe>` для PDF/external_url, `dangerouslySetInnerHTML` для text (с DOMPurify? — обсудим в Task 5).

**Зависимости перед стартом.** Plan C merged (PR #178). Текущая ветка: `feat/2026-05-26-course-viewer-plan`.

**Что НЕ входит в этот план** (вынесено в Phase 2+):

- Загрузка видео в S3 + потоковая отдача — Phase 1 task роадмапа, **отдельный план** (требует backend-changes: S3 upload, Range-header streaming, signed URLs). Пока ассуме: `Material.fileId` уже хранится через существующий `FilesService.uploadFile`, frontend получает URL через `/files/:id/download`.
- SCORM плеер — Phase 8 роадмапа.
- Тесты внутри курса (test material type) — Phase 3 роадмапа.
- Мобильная адаптивность сверх базовой responsive grid — Phase 10.
- Real-time прогресс на разных вкладках (single-tab assumed).

---

## File Structure

### Create — frontend

- `apps/frontend/src/features/course-viewer/types.ts` — `CourseTreeNode` (module + materials), `CourseViewerState`.
- `apps/frontend/src/features/course-viewer/api.ts` — `loadCourseTree(courseVersionId)` — батч `listModules` + `listMaterials per module`.
- `apps/frontend/src/features/course-viewer/hooks.ts` — `useCourseTree`, `useMaterialProgress`, `useUpsertProgress`.
- `apps/frontend/src/features/course-viewer/lock-logic.ts` — pure function `computeUnlockedMaterials(tree, progress)`.
- `apps/frontend/src/features/course-viewer/lock-logic.test.ts` — unit tests на правила блокировки.
- `apps/frontend/src/features/course-viewer/table-of-contents.tsx` — TOC компонент (модули с раскрытием, материалы с галочками + замками).
- `apps/frontend/src/features/course-viewer/material-player.tsx` — switch по `materialType`, рендерит подходящий sub-player.
- `apps/frontend/src/features/course-viewer/video-player.tsx` — HTML5 `<video>` с onProgress / onEnded.
- `apps/frontend/src/features/course-viewer/pdf-viewer.tsx` — iframe с PDF.
- `apps/frontend/src/features/course-viewer/text-viewer.tsx` — sanitized HTML render.
- `apps/frontend/src/features/course-viewer/external-link-viewer.tsx` — confirmation + ссылка наружу.
- `apps/frontend/src/features/course-viewer/use-watch-tracker.ts` — hook для накопления `studiedSeconds` (timer + visibility).
- `apps/frontend/src/features/course-viewer/use-watch-tracker.test.ts` — TDD на накопление + idle pause.
- `apps/frontend/src/features/course-viewer/course-viewer-screen.tsx` — top-level: TOC + player + breadcrumbs + progress bar.
- `apps/frontend/src/features/course-viewer/course-viewer.test.tsx` — integration test (mocked api).

### Modify — frontend

- `apps/frontend/src/features/mvp/screens.tsx` — `LearnerCourseDetailsScreen` теперь импортирует `CourseViewerScreen` и делегирует ему. Сохранить fallback для loading/error.
- `apps/frontend/src/features/mvp/api.ts` — добавить `getMaterialDownloadUrl(fileId)` если ещё нет (требуется для video/pdf).
- `apps/frontend/src/features/mvp/types.ts` — расширить `Material` опциональным `fileId?: string` для матч backend.
- `apps/frontend/app/learner/courses/[id]/page.tsx` — без изменений (page просто рендерит screen).

### Modify — backend

- `apps/backend/src/modules/mvp/mvp.types.ts` — `Material.fileId` уже есть на backend, синхронизация не требуется. Проверить что `listMaterials` ответ включает `fileId`.

---

## Task 1 — Type alignment: Material.fileId on frontend

**Files:** modify `apps/frontend/src/features/mvp/types.ts`. Test: type-level + smoke.

- [ ] **Step 1:** Расширить `Material` interface на frontend: `fileId?: string`.
- [ ] **Step 2:** Запустить `pnpm --filter @cdoprof/frontend exec tsc --noEmit` — ожидается 0 ошибок.
- [ ] **Step 3:** Commit `feat(frontend): add fileId to Material type to match backend (Phase 1 §4.3)`.

---

## Task 2 — Pure lock logic

**Files:** create `lock-logic.ts` + `.test.ts`.

### Спецификация правил блокировки

Material `M` в модуле `Mod` **разблокирован**, если:

1. Все required materials в той же модуле, идущие раньше по `sortOrder`, имеют status `completed`.
2. Все required materials в предыдущих модулях (`module.sortOrder < Mod.sortOrder`) имеют status `completed`.

Если в Material `isRequired=false` — он не блокирует следующие, но сам разблокирован после предыдущего required.

### Steps

- [ ] **Step 1:** Написать тесты на 6+ кейсов:
  - Первый материал всегда разблокирован.
  - Required completed → следующий разблокирован.
  - Required in_progress → следующий ЗАБЛОКИРОВАН.
  - Не-required can be in_progress, но следующий required разблокирован если предыдущий required completed.
  - Cross-module: модуль B блокируется пока в модуле A не завершены required.
  - Edge case: пустой модуль (нет materials).

- [ ] **Step 2:** Implement `computeUnlockedMaterials(tree, progressByMaterialId)`. Pure function, return `Map<materialId, 'unlocked' | 'locked'>`.

- [ ] **Step 3:** Commit `feat(frontend): add pure lock logic for course viewer TOC (Phase 1 §4.3)`.

---

## Task 3 — Course tree API + hook

**Files:** create `course-viewer/types.ts`, `api.ts`, `hooks.ts`.

### Спецификация

- `loadCourseTree(session, courseVersionId)` делает:
  1. `listModules(courseVersionId)` — ожидаемо ≤30 модулей.
  2. Для каждого модуля — `listMaterials(moduleId)` параллельно через `Promise.all`.
  3. Сортирует модули и материалы по `sortOrder`.
  4. Возвращает `CourseTreeNode[]`.

- `useCourseTree(courseId)`:
  1. Сначала `useCourse(courseId)` → берёт `courseVersionId` (последняя published version — через `useCourseVersions`).
  2. Затем `loadCourseTree(courseVersionId)`.
  3. Возвращает `{ tree, isLoading, error }`.

### Steps

- [ ] **Step 1:** Type-level tests (compile + smoke). Mock api, проверить структуру `tree[0].materials[0].title`.
- [ ] **Step 2:** Реализация. **Важно:** обработать случай, когда у курса нет published version → возвращать `tree = []` и displayable error.
- [ ] **Step 3:** Commit `feat(frontend): add course tree API + hook for viewer (Phase 1 §4.3)`.

---

## Task 4 — TableOfContents component

**Files:** create `table-of-contents.tsx`.

### Спецификация

- Список модулей в `<details><summary>` (раскрывающиеся).
- Каждый модуль показывает заголовок + кол-во материалов + progress per модуль (X/Y completed).
- Каждый материал в модуле — кликабельный row:
  - Иконка статуса: ☐ not_started, ⏳ in_progress, ✓ completed.
  - Если заблокирован — серый текст + 🔒 + не кликабельный.
  - Подсветка current material (active).
- Layout: фиксированная боковая колонка на десктопе (`width: 320px`), модал/drawer на мобильном (CSS media query `@media (max-width: 768px)`).

### Steps

- [ ] **Step 1:** Snapshot test через render-tree on fixture (3 модуля по 2 материала, разные статусы).
- [ ] **Step 2:** Implementation с pure props (`tree`, `progressByMaterialId`, `lockState`, `currentMaterialId`, `onSelect`).
- [ ] **Step 3:** Commit `feat(frontend): add TableOfContents component with statuses and locks (Phase 1 §4.3)`.

---

## Task 5 — Watch tracker hook

**Files:** create `use-watch-tracker.ts` + `.test.ts`.

### Спецификация

- `useWatchTracker({ materialId, minViewSeconds, onTick })` запускает interval 1s.
- На каждом tick: если `document.visibilityState === 'visible'` и плеер активен — increment `studiedSeconds` и вызвать `onTick(studiedSeconds)`.
- Тротлинг flush в API: каждые 5 секунд или при `unmount`. Параметр `flushIntervalMs = 5000`.
- При reaching `minViewSeconds` — вызывать `onMinimumReached()` колбэк один раз.

### Steps

- [ ] **Step 1:** TDD-тесты с `vi.useFakeTimers()`:
  - 10 ticks → 10s studied.
  - Hidden tab → не накапливает.
  - Flush API call 1 раз каждые 5s.
  - `onMinimumReached` вызывается ровно один раз.

- [ ] **Step 2:** Implementation. Хранить `studiedSeconds` в `useRef` (не state — не нужны re-renders).

- [ ] **Step 3:** Commit `feat(frontend): add watch tracker hook for material progress (Phase 1 §4.3)`.

---

## Task 6 — Material sub-players (video / pdf / text / external_url)

**Files:** create 4 sub-players + `material-player.tsx` switcher.

### Спецификация

- **VideoPlayer:** HTML5 `<video controls>` + onPlay/onPause/onEnded. Источник — URL от `mvpApi.getMaterialDownloadUrl(fileId)`. Если `fileId` отсутствует — placeholder «Видео не загружено».
- **PdfViewer:** `<iframe src={pdfUrl}>` height 80vh. Browser-native PDF viewer (Chrome/Firefox).
- **TextViewer:** Markdown? Нет — Plan C использует backend HTML строки. Используем `dangerouslySetInnerHTML` с **DOMPurify** для sanitization. **Новая зависимость:** `dompurify` + `@types/dompurify`. Если не хотим — fallback на `<pre>{raw}</pre>`.
- **ExternalLinkViewer:** Кнопка «Открыть в новой вкладке» + предупреждение «Внешний ресурс». Не auto-redirect.
- **MaterialPlayer:** switch по `material.materialType`, прокидывает `material` + `onWatchTick` callback в sub.

### Steps

- [ ] **Step 1:** Решение по DOMPurify — обсудить с командой. Если нет — Markdown через `marked` или `<pre>`. Default: `dompurify` (industry standard, ≈45kb gz).
- [ ] **Step 2:** TDD type tests + render snapshots для каждого sub-player.
- [ ] **Step 3:** Implementation 4 файлов + switcher.
- [ ] **Step 4:** Commit `feat(frontend): add material sub-players for video/pdf/text/external_url (Phase 1 §4.3)`.

---

## Task 7 — CourseViewerScreen integration

**Files:** create `course-viewer-screen.tsx` + integration test.

### Спецификация

- Layout: TOC слева (collapsed on mobile) + Player справа + Progress header сверху.
- State machine:
  1. Load `useCourseTree(courseId)` + `useLearnerCourseProgress(courseId)`.
  2. Compute `lockState` через `computeUnlockedMaterials`.
  3. Find `currentMaterialId` из URL hash или first unlocked not_started.
  4. Render TOC + Player.
  5. Player feeds progress through `useWatchTracker` → `mvpApi.upsertMaterialProgress`.
  6. After progress update, invalidate `['mvp', 'progress', ...]` → recompute lockState → re-render.
- URL deep-link: `/learner/courses/[id]#material=mat_xyz`.

### Steps

- [ ] **Step 1:** Integration test (с mocked api):
  - Fixture: 2 модуля × 2 материала, прогресс пустой.
  - Render → TOC показывает все 4, первый материал unlocked, остальные locked.
  - Click first material → player отображается.
  - Simulate watch 10s → upsertMaterialProgress called.
  - После completed первого — второй unlocked.

- [ ] **Step 2:** Implementation.

- [ ] **Step 3:** Commit `feat(frontend): add CourseViewerScreen integration (Phase 1 §4.3)`.

---

## Task 8 — Wire into LearnerCourseDetailsScreen

**Files:** modify `mvp/screens.tsx`.

- [ ] **Step 1:** Заменить тело `LearnerCourseDetailsScreen` на `<CourseViewerScreen courseId={id} />` с error/loading wrappers.
- [ ] **Step 2:** Smoke-tests на старой странице остаются зелёными.
- [ ] **Step 3:** Manual smoke: открыть `/learner/courses/[id]` — должен показать TOC + первый материал.
- [ ] **Step 4:** Commit `feat(frontend): wire CourseViewerScreen into learner course route (Phase 1 §4.3)`.

---

## Verification

- [ ] `pnpm --filter @cdoprof/frontend test` — все зелёные. Baseline 125 + ~25 новых = ~150.
- [ ] `pnpm --filter @cdoprof/frontend exec tsc --noEmit` — 0 ошибок.
- [ ] Manual smoke chain:
  1. Tenant_admin создаёт course → version → 2 модуля × 2 материала (1 video + 1 text).
  2. Зачисляет learner.
  3. Learner залогинивается через magic link → `/learner` → нажимает курс.
  4. Видит TOC. Первый материал unlocked, остальные locked.
  5. Открывает первый, смотрит 10 секунд (`minViewSeconds=10`) → автозавершение → следующий unlocked.
  6. Прогресс-бар обновляется в реальном времени (≤5s lag через flush).

---

## Self-Review

**1. Spec coverage:**

- §4.3 видео-плеер с поддержкой PDF/HTML/презентаций — ✓ Tasks 6 (4 sub-players, презентации = PDF + external_url).
- §4.3 оглавление с галочками + блокировкой — ✓ Tasks 2 (lock logic) + 4 (TOC).
- §4.3 адаптивность под смартфон — ⚠️ Минимальная (CSS media query); полная — Phase 10 роадмапа.

**2. Deviations from spec (intentional):**

- Видео-стриминг через `<video>` с прямым URL — нет HLS/DASH (Phase 1 spec roadmap'а task'a «загрузка видео в S3» отдельно). После Phase 1 video task'а можно подключить HLS.
- Тесты внутри курса не поддерживаются — Phase 3.
- Re-watch ((completed → in_progress → completed) → in_progress) — current behaviour: статус остаётся `completed`, progress продолжает копится, но lockState не меняется. Это OK.

**3. Compile-time sync:**

- `MaterialType` union на frontend — 4 значения (`'file' | 'external_url' | 'text' | 'video'`); должен совпадать с backend. Future template-types из Pillar A — отдельная категория, не влияет.

**4. Risks:**

- DOMPurify decision — заблокирует Task 6 если откладывать. Решение **до старта**: добавляем `dompurify` (industry standard).
- `upsertMaterialProgress` под нагрузкой (≥1 request/5s/ученик) — нужно проверить, что throttler на backend это допускает. Сейчас baseline `ThrottlerModule.forRoot({ ttl: 60_000, limit: 300 })` = 5 req/sec — OK для одного ученика.
- File downloads без CDN — `<video src={downloadUrl}>` тянет всё файлом, нет range request. Для V1 acceptable; для production нужен Phase 1 «загрузка видео в S3» task.

**5. Migration ordering:**

- Нет миграций — план чисто frontend.
- Backend types (`Material.fileId`) уже на месте; frontend type sync — Task 1.

---

## Estimated effort

- Task 1: 15 минут (type sync).
- Task 2: 1.5 часа (lock logic + tests).
- Task 3: 1 час (API + hook).
- Task 4: 2 часа (TOC component + responsive).
- Task 5: 2 часа (watch tracker hook + fake timers).
- Task 6: 3 часа (4 sub-players + DOMPurify integration).
- Task 7: 3 часа (integration + tests).
- Task 8: 30 минут (wire).

**Total: ~13 часов** (1 sprint, 2-3 рабочих дня).
