-- 0111_learning_learners_linked_iam_user.sql
--
-- ТЗ «Переход с CDOPROF», Фаза 1, срез 3b (чтение зачислений из таблиц под флагом).
--
-- ЗАЧЕМ. Anti-IDOR списка зачислений (§5.160): слушатель, привязанный к учётной записи, видит
-- только свои зачисления. В снимке привязка — поле `linkedIamUserId`. В таблице `learning.learners`
-- есть `user_id` с внешним ключом на `iam.users`, и проекция пишет его только для существующей
-- учётной записи (0110, §5.562); для несуществующей исходник уходил в `payload`. Отбор по
-- `payload->>'linkedIamUserId'` в `where` без индекса запрещён сторожем `json-filters-indexed`
-- и не нужен: заводим обычную колонку привязки «как в снимке», без внешнего ключа, с частичным
-- индексом для выборки «слушатели этого пользователя». `user_id` остаётся FK-проверенной связью.
--
-- Только добавление; повторный запуск безопасен. Заполняется проекцией при сохранении снимка и
-- бэкфиллом `lms_normalized` (повторяем).

ALTER TABLE learning.learners
  ADD COLUMN IF NOT EXISTS linked_iam_user_id text;

CREATE INDEX IF NOT EXISTS learners_tenant_linked_iam_user_idx
  ON learning.learners (tenant_id, linked_iam_user_id)
  WHERE linked_iam_user_id IS NOT NULL;
