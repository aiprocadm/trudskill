-- 0065_learning_video_progress.sql
-- Фаза 2 «Видео и часы», Task 6 (ФТ-B3.1/B3.3) — прогресс по РЕАЛЬНОМУ воспроизведению.
--
-- До этой таблицы прогресс считался по времени на открытой вкладке: урок засчитывался
-- тому, кто открыл вкладку и ушёл. Здесь хранится покрытие ролика — какие именно куски
-- проиграны, — и позиция для возобновления (ФТ-B3.3).
--
-- Почему отдельная таблица, а не поля в learning.material_progress: у видео своя единица
-- измерения (отрезки, а не секунды), и на один материал приходится одна строка НА КАЖДОЕ
-- зачисление. Общий прогресс материала остаётся источником правды для «пройдено» —
-- сюда он не переезжает, а получает результат через существующий upsertMaterialProgress.
--
-- Additive + idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS learning.video_progress (
  tenant_id text NOT NULL,
  enrollment_id text NOT NULL,
  material_id text NOT NULL,
  -- Непересекающиеся отрезки [[from,to],...] в секундах от начала ролика.
  watched_ranges jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Куда вернуть слушателя при повторном открытии урока (ФТ-B3.3).
  last_position_seconds integer NOT NULL DEFAULT 0,
  -- Максимум, до которого он честно досмотрел; опора антиперемотки (ФТ-B3.2, Task 7).
  max_position_seconds integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Одна строка на (тенант, зачисление, материал): heartbeat'ы идут потоком и обязаны
  -- обновлять одну запись, а не плодить новые.
  CONSTRAINT video_progress_pk PRIMARY KEY (tenant_id, enrollment_id, material_id)
);

-- «Сколько времени слушатель провёл в видео этого зачисления» — запрос журнала часов
-- (ФТ-B3.4, Task 8).
CREATE INDEX IF NOT EXISTS idx_video_progress_tenant_enrollment
  ON learning.video_progress (tenant_id, enrollment_id);

COMMIT;
