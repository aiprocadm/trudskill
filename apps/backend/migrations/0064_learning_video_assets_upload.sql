-- 0064_learning_video_assets_upload.sql
-- Фаза 2 «Видео и часы», Task 2 (ФТ-B1.1) — загрузка видео методистом.
--
-- Ассету нужно помнить ДВЕ вещи, которых не было в 0063:
--   * file_id — запись в storage.files. Через неё видео проходит стандартный
--     антивирусный гейт (ФТ-G5) и общий учёт файлов; отдельного пути для видео не заводим.
--   * multipart_upload_id — идентификатор незавершённой загрузки по частям. Без него
--     нечем ни продолжить заливку после обрыва, ни отменить её: залитые части остались бы
--     в хранилище и молча занимали место (а это ещё и деньги при аренде, ФТ-B1.3).
--
-- Обе колонки nullable: у провайдерской ветки (Task 10) загрузка идёт мимо нашего S3,
-- и ни файла, ни multipart-загрузки у нас нет.
--
-- Additive + idempotent.

BEGIN;

ALTER TABLE learning.video_assets
  ADD COLUMN IF NOT EXISTS file_id text NULL;

ALTER TABLE learning.video_assets
  ADD COLUMN IF NOT EXISTS multipart_upload_id text NULL;

COMMENT ON COLUMN learning.video_assets.file_id IS
  'Фаза 2 Task 2: запись в storage.files — через неё видео проходит AV-гейт (ФТ-G5). Null для провайдерской ветки.';

COMMENT ON COLUMN learning.video_assets.multipart_upload_id IS
  'Фаза 2 Task 2: идентификатор незавершённой загрузки по частям (S3 UploadId); нужен для продолжения и отмены. Null для провайдерской ветки.';

COMMIT;
