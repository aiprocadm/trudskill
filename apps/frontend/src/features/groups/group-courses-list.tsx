'use client';

import { DataTable, DetailDrawer, DirectorySelect, DrawerCancelButton } from '@trudskill/ui';
import { useState } from 'react';

import { groupCoursesApi, useGroupCourseTeachers } from './group-courses-api';
import { SectionError } from '../../components/state-wrappers';
import { useAuth } from '../auth/context';

import type { GroupCourse } from '../mvp/types';

/** Срок курса в группе словами: «36 дн.» или «по сроку курса». */
export const groupCourseDurationLabel = (durationDays?: number): string =>
  durationDays ? `${durationDays} дн.` : 'по сроку курса';

/** Подпись преподавателя: ФИО из списка преподавателей; не нашёлся — честно, без идентификатора. */
export const groupCourseTeacherLabel = (
  teacherUserId: string | undefined,
  names: ReadonlyMap<string, string>
): string => {
  if (!teacherUserId) return 'не назначен';
  return names.get(teacherUserId) ?? 'нет в списке преподавателей';
};

function GroupCourseDrawer({
  item,
  courseTitle,
  onClose,
  onSaved
}: {
  item: GroupCourse;
  courseTitle: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { session } = useAuth();
  const [duration, setDuration] = useState(item.durationDays ? String(item.durationDays) : '');
  const [teacherId, setTeacherId] = useState(item.teacherUserId ?? '');
  const [query, setQuery] = useState('');
  const teachers = useGroupCourseTeachers(query);
  const [teacherName, setTeacherName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const options = (teachers.data?.items ?? []).map((t) => ({ value: t.id, label: t.name }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!session) return;
    const days = Number.parseInt(duration, 10);
    setSaving(true);
    setError(null);
    try {
      await groupCoursesApi.update(session, item.id, {
        durationDays: duration.trim() && Number.isFinite(days) && days > 0 ? days : null,
        teacherUserId: teacherId || null
      });
      onSaved(`Курс «${courseTitle}» в группе сохранён.`);
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DetailDrawer
      open
      onClose={onClose}
      title={`Курс в группе: ${courseTitle}`}
      hasUnsavedChanges={
        duration !== (item.durationDays ? String(item.durationDays) : '') ||
        teacherId !== (item.teacherUserId ?? '')
      }
    >
      <form onSubmit={(e) => void submit(e)} className="ui-stack">
        <label className="ui-field">
          <span className="ui-field-label">Срок обучения, дней</span>
          <input
            className="ui-input"
            inputMode="numeric"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
          />
          <span className="ui-hint">Пусто — по сроку курса.</span>
        </label>
        <DirectorySelect
          label="Преподаватель"
          value={teacherId}
          onChange={(id) => {
            setTeacherId(id);
            setTeacherName(options.find((o) => o.value === id)?.label ?? '');
          }}
          options={options}
          query={query}
          onQueryChange={setQuery}
          isLoading={teachers.isLoading}
          emptyLabel="— не назначен —"
          emptyHint="Преподавателей с такими ФИО нет — роль «Преподаватель» выдаёт администратор."
          searchLabel="Поиск преподавателя"
          searchPlaceholder="Фамилия или имя"
          {...(teacherName ? { selectedLabel: teacherName } : {})}
        />
        <span className="ui-hint">Печатается в протоколе как преподаватель курса.</span>
        {error !== null ? <SectionError error={error} /> : null}
        <div className="ui-modal-actions">
          <DrawerCancelButton className="ui-button" disabled={saving} onFallbackClose={onClose} />
          <button
            type="submit"
            className={`ui-button ui-button--primary ${saving ? 'ui-button--loading' : ''}`}
            disabled={saving}
          >
            Сохранить курс в группе
          </button>
        </div>
      </form>
    </DetailDrawer>
  );
}

/**
 * Курсы группы (МГ-E4.5, срез 17.2): название, срок и преподаватель — тот, кто попадёт в
 * протокол. Правка — «Изменить курс в группе» (срок и преподаватель).
 */
export function GroupCoursesList({
  items,
  courseTitleById,
  canEdit,
  onChanged
}: {
  items: GroupCourse[];
  courseTitleById: Record<string, string>;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const teachers = useGroupCourseTeachers(
    '',
    items.some((item) => item.teacherUserId)
  );
  const names = new Map((teachers.data?.items ?? []).map((t) => [t.id, t.name]));
  const [editing, setEditing] = useState<GroupCourse | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const titleOf = (item: GroupCourse): string => courseTitleById[item.courseId] ?? 'курс не найден';

  if (items.length === 0) {
    return (
      <p className="ui-hint">
        Курсов пока нет — назначьте курс, чтобы слушателям было чему учиться.
      </p>
    );
  }

  return (
    <>
      {notice ? (
        <p className="ui-callout" role="status">
          {notice}
        </p>
      ) : null}
      <DataTable
        columns={[
          { key: 'title', title: 'Курс' },
          { key: 'duration', title: 'Срок' },
          { key: 'teacher', title: 'Преподаватель' }
        ]}
        rows={items.map((item) => ({
          ...item,
          title: titleOf(item),
          duration: groupCourseDurationLabel(item.durationDays),
          teacher: groupCourseTeacherLabel(item.teacherUserId, names)
        }))}
        rowActions={(row) =>
          canEdit ? [{ label: 'Изменить курс в группе', onSelect: () => setEditing(row) }] : []
        }
      />
      {editing ? (
        <GroupCourseDrawer
          item={editing}
          courseTitle={titleOf(editing)}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            setEditing(null);
            setNotice(message);
            onChanged();
          }}
        />
      ) : null}
    </>
  );
}
