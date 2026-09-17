-- 0096_iam_role_names_ru.sql
--
-- ТЗ «Стабилизация, UX и развитие», 4.1 (Я1), решение Р1: один русский словарь ролей.
--
-- Посев 0010 и 0038 дал ролям английские и разнобойные имена: 'Platform admin', 'Tenant admin',
-- 'Manager', 'Methodist', 'Учащийся'. Ручка /roles отдаёт их как есть, и выпадающий список
-- пользователей печатал в одной колонке «Представитель заказчика», «Учащийся», «Manager»,
-- «Methodist», «Platform admin», «Преподаватель», «Tenant admin».
--
-- Это данные, а не схема. Имена выравниваются по словарю
-- apps/frontend/src/features/texts/roles.ru.ts; сторож roles-speak-russian.e2e.test.ts сверяет
-- этот файл со словарём, чтобы посев и экран не разошлись снова. Повторный запуск безопасен.
-- Роли заведены по центрам (одна строка на центр) — обновляются все строки с этим кодом.

BEGIN;

UPDATE iam.roles SET name = 'Администратор платформы' WHERE code = 'platform_admin';
UPDATE iam.roles SET name = 'Администратор центра' WHERE code = 'tenant_admin';
UPDATE iam.roles SET name = 'Руководитель' WHERE code = 'manager';
UPDATE iam.roles SET name = 'Методист' WHERE code = 'methodist';
UPDATE iam.roles SET name = 'Преподаватель' WHERE code = 'teacher';
UPDATE iam.roles SET name = 'Слушатель' WHERE code = 'learner';
UPDATE iam.roles SET name = 'Представитель заказчика' WHERE code = 'counterparty_rep';

COMMIT;
