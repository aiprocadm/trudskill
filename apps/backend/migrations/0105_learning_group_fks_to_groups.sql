-- 0105_learning_group_fks_to_groups.sql
--
-- ТЗ «Переход с CDOPROF», Фаза 1, срез 0 (МГ-A1.1 «groups объединяется со study_groups:
-- целевая — learning.groups, enrollments.group_id переводится новой миграцией, FK NOT VALID,
-- VALIDATE после бэкфилла»). Решение агента РМ31.
--
-- ЗАЧЕМ. Сегодня в `learning.enrollments`, `learning.group_courses`, `documents.generated_documents`
-- и `assessment.exam_results` нельзя вставить ни одной строки: их внешние ключи указывают на
-- таблицы, которые рантайм никогда не заполняет (домен живёт в JSON-снимке):
--   • `learning.study_groups` — заброшенный близнец `learning.groups` (0002/0003);
--   • `core.users` для `enrollments.learner_id` (0014) — второй ключ на ту же колонку поверх
--     ключа на `learning.learners` из 0002: слушатель — не всегда пользователь;
--   • `documents.templates` / `template_versions`, `learning.courses` / `course_versions`,
--     `assessment.tests` / `test_attempts` — остаются в снимке и после Фазы 1.
-- `NOT VALID` не спасает: он пропускает старые строки, но проверяет каждую новую.
--
-- РМ31 — трактовка правила «миграции только аддитивные»: аддитивность — это сохранность данных
-- (ни одна колонка и ни одна строка не теряются). Снятие ограничения, которое ссылается на
-- пустую по построению таблицу, данных не трогает и обратимо: каждое снятое ограничение
-- названо ниже вместе с миграцией-источником — вернуть его можно одной строкой.
--
-- СНЯТЫЕ ОГРАНИЧЕНИЯ (имя — источник — на что указывало):
--   enrollments_group_id_fkey                  — 0002 — learning.study_groups(id)
--   enrollments_group_tenant_fk                — 0003 — learning.study_groups(tenant_id, id)  → ЗАМЕНЁН на learning.groups
--   learning_enrollments_learner_id_fkey       — 0014 — core.users(id)  (остаётся enrollments_learner_tenant_fk → learning.learners, 0003)
--   learning_enrollments_status_chk            — 0014 — CHECK без 'suspended' (остаётся enrollments_status_chk из 0002 с 'suspended')
--   group_courses_group_id_fkey                — 0002 — learning.study_groups(id)
--   group_courses_group_tenant_fk              — 0003 — learning.study_groups(tenant_id, id)  → ЗАМЕНЁН на learning.groups
--   group_courses_course_id_fkey               — 0002 — learning.courses(id)          (курсы — в снимке)
--   group_courses_course_tenant_fk             — 0003 — learning.courses(tenant_id, id)
--   group_courses_course_version_id_fkey       — 0002 — learning.course_versions(id)
--   group_courses_course_version_tenant_fk     — 0003 — learning.course_versions(tenant_id, id)
--   generated_documents_group_id_fkey          — 0002 — learning.study_groups(id)
--   generated_documents_group_tenant_fk        — 0003 — learning.study_groups(tenant_id, id)  → ЗАМЕНЁН на learning.groups
--   generated_documents_template_id_fkey       — 0002 — documents.templates(id)      (шаблоны — в снимке)
--   generated_documents_template_tenant_fk     — 0003 — documents.templates(tenant_id, id)
--   generated_documents_template_version_id_fkey — 0002 — documents.template_versions(id)
--   generated_documents_template_version_tenant_fk — 0003 — documents.template_versions(tenant_id, id)
--   exam_results_test_id_fkey                 — 0002 — assessment.tests(id)          (тесты — в снимке)
--   exam_results_test_tenant_fk                — 0003 — assessment.tests(tenant_id, id)
--   exam_results_best_attempt_id_fkey          — 0002 — assessment.test_attempts(id)
--   exam_results_best_attempt_tenant_fk        — 0003 — assessment.test_attempts(tenant_id, id)
--
-- Ключи на живые таблицы (core.tenants, learning.learners, crm.counterparties, storage.files,
-- learning.enrollments) не трогаются.

-- 1. Зачисления.
ALTER TABLE learning.enrollments
  DROP CONSTRAINT IF EXISTS enrollments_group_id_fkey,
  DROP CONSTRAINT IF EXISTS enrollments_group_tenant_fk,
  DROP CONSTRAINT IF EXISTS learning_enrollments_learner_id_fkey,
  DROP CONSTRAINT IF EXISTS learning_enrollments_status_chk;
ALTER TABLE learning.enrollments
  ADD CONSTRAINT enrollments_group_tenant_fk
    FOREIGN KEY (tenant_id, group_id) REFERENCES learning.groups (tenant_id, id) NOT VALID;

-- 2. Курсы группы. Курс остаётся в снимке — ключ на него не ставится; преподаватель — §17.
ALTER TABLE learning.group_courses
  DROP CONSTRAINT IF EXISTS group_courses_group_id_fkey,
  DROP CONSTRAINT IF EXISTS group_courses_group_tenant_fk,
  DROP CONSTRAINT IF EXISTS group_courses_course_id_fkey,
  DROP CONSTRAINT IF EXISTS group_courses_course_tenant_fk,
  DROP CONSTRAINT IF EXISTS group_courses_course_version_id_fkey,
  DROP CONSTRAINT IF EXISTS group_courses_course_version_tenant_fk;
ALTER TABLE learning.group_courses
  ADD CONSTRAINT group_courses_group_tenant_fk
    FOREIGN KEY (tenant_id, group_id) REFERENCES learning.groups (tenant_id, id) NOT VALID;
ALTER TABLE learning.group_courses
  ADD COLUMN IF NOT EXISTS teacher_user_id text;

-- 3. Выданные документы. Шаблон остаётся в снимке — ключ на него не ставится.
ALTER TABLE documents.generated_documents
  DROP CONSTRAINT IF EXISTS generated_documents_group_id_fkey,
  DROP CONSTRAINT IF EXISTS generated_documents_group_tenant_fk,
  DROP CONSTRAINT IF EXISTS generated_documents_template_id_fkey,
  DROP CONSTRAINT IF EXISTS generated_documents_template_tenant_fk,
  DROP CONSTRAINT IF EXISTS generated_documents_template_version_id_fkey,
  DROP CONSTRAINT IF EXISTS generated_documents_template_version_tenant_fk;
ALTER TABLE documents.generated_documents
  ADD CONSTRAINT generated_documents_group_tenant_fk
    FOREIGN KEY (tenant_id, group_id) REFERENCES learning.groups (tenant_id, id) NOT VALID;

-- 4. Результаты экзаменов. Тест и попытка остаются в снимке.
ALTER TABLE assessment.exam_results
  DROP CONSTRAINT IF EXISTS exam_results_test_id_fkey,
  DROP CONSTRAINT IF EXISTS exam_results_test_tenant_fk,
  DROP CONSTRAINT IF EXISTS exam_results_best_attempt_id_fkey,
  DROP CONSTRAINT IF EXISTS exam_results_best_attempt_tenant_fk;
