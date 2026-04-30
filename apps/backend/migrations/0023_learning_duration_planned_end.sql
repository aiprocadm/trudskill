-- Сроки курсов в программе (группа) и плановое окончание зачисления
ALTER TABLE learning.group_courses
  ADD COLUMN IF NOT EXISTS duration_days integer;

COMMENT ON COLUMN learning.group_courses.duration_days IS 'Days from enrollment to planned end for this course in the program; MVP JSON store mirrors this field.';

ALTER TABLE learning.enrollments
  ADD COLUMN IF NOT EXISTS planned_end_at timestamptz;

COMMENT ON COLUMN learning.enrollments.planned_end_at IS 'Max planned completion across group courses; MVP JSON store mirrors this field.';

CREATE INDEX IF NOT EXISTS enrollments_tenant_planned_end_idx
  ON learning.enrollments (tenant_id, planned_end_at)
  WHERE planned_end_at IS NOT NULL;
