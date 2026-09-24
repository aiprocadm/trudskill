'use client';

import {
  BlockedHint,
  DetailDrawer,
  DrawerCancelButton,
  FormSection,
  KeyValueList,
  LookupSelect,
  blockedProps
} from '@trudskill/ui';
import { useState } from 'react';

import {
  buildCoursePayload,
  courseBasicsProblem,
  courseBasicsRows,
  toCourseBasicsForm
} from './course-basics';
import { SectionCard, SectionError } from '../../components/state-wrappers';
import { hasPermission } from '../../lib/rbac/permissions';
import { useAuth } from '../auth/context';
import { mvpApi } from '../mvp/api';
import { useDirectionsList, useFrdoDocumentKinds } from '../mvp/hooks';
import { StaffSelect } from '../tasks/staff-select';

import type { CourseBasicsForm, ExtraFieldRow } from './course-basics';
import type { Course } from '../mvp/types';

const SAVE_KEY = 'course-basics-save';

/**
 * «Основное» карточки курса (МГ-E2.1, срез 16.3): поля карточки CDOPROF — код, название,
 * направление, «представление» для документов, срок по умолчанию, цена, вид ФИС ФРДО, части
 * номера удостоверения, ответственный, доп. поля для бланков (`{course.extra.<ключ>}`).
 */
export function CourseBasicsSection({ course, onSaved }: { course: Course; onSaved: () => void }) {
  const { session } = useAuth();
  const permissions = session?.permissions ?? [];
  const canWrite = hasPermission(permissions, 'courses.write');
  const directions = useDirectionsList({ page: 1, page_size: 200, sort: 'name:asc' });
  const frdo = useFrdoDocumentKinds();
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const directionName = course.directionId
    ? directions.data?.items.find((d) => d.id === course.directionId)?.name
    : undefined;
  const rows = courseBasicsRows(course, {
    ...(directionName ? { direction: directionName } : {}),
    ...(course.responsibleName ? { responsible: course.responsibleName } : {}),
    frdoKinds: frdo.data?.items ?? []
  });

  return (
    <SectionCard title="Основное">
      <KeyValueList items={rows} />
      {notice ? (
        <p className="ui-callout" role="status">
          {notice}
        </p>
      ) : null}
      {canWrite && course.status !== 'archived' ? (
        <div className="ui-form-actions">
          <button type="button" className="ui-button-secondary" onClick={() => setOpen(true)}>
            Изменить основное
          </button>
        </div>
      ) : null}
      {open ? (
        <CourseBasicsDrawer
          course={course}
          directions={(directions.data?.items ?? []).filter(
            (d) => d.status !== 'archived' || d.id === course.directionId
          )}
          frdoKinds={frdo.data?.items ?? []}
          canPickResponsible={hasPermission(permissions, 'tasks.write')}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            setNotice('Основное курса сохранено.');
            onSaved();
          }}
        />
      ) : null}
    </SectionCard>
  );
}

function CourseBasicsDrawer({
  course,
  directions,
  frdoKinds,
  canPickResponsible,
  onClose,
  onSaved
}: {
  course: Course;
  directions: ReadonlyArray<{ id: string; name: string }>;
  frdoKinds: ReadonlyArray<{ code: string; frdoKind: string }>;
  canPickResponsible: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { session } = useAuth();
  const [form, setForm] = useState<CourseBasicsForm>(() => toCourseBasicsForm(course));
  const [initial] = useState<CourseBasicsForm>(() => toCourseBasicsForm(course));
  const [responsibleName, setResponsibleName] = useState(course.responsibleName ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const set = <K extends keyof CourseBasicsForm>(key: K, value: CourseBasicsForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));
  const setExtra = (index: number, patch: Partial<ExtraFieldRow>) =>
    set(
      'docExtraFields',
      form.docExtraFields.map((row, i) => (i === index ? { ...row, ...patch } : row))
    );
  const setPart = (index: 0 | 1 | 2, value: string) => {
    const parts = [...form.certificateNumberParts] as [string, string, string];
    parts[index] = value;
    set('certificateNumberParts', parts);
  };

  const problem = courseBasicsProblem(form) ?? undefined;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!session || problem) return;
    setSaving(true);
    setError(null);
    try {
      await mvpApi.updateCourse(session, course.id, buildCoursePayload(form));
      onSaved();
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
      title={`Основное курса «${course.title}»`}
      hasUnsavedChanges={JSON.stringify(form) !== JSON.stringify(initial)}
      width="md"
    >
      <form onSubmit={(e) => void submit(e)} className="ui-stack">
        <FormSection title="Курс">
          <label className="ui-field">
            <span className="ui-field-label">Код *</span>
            <input
              className="ui-input"
              value={form.code}
              onChange={(e) => set('code', e.target.value)}
            />
            <span className="ui-hint">
              Как в прежней системе, например 13.Б — не повторяется в центре.
            </span>
          </label>
          <label className="ui-field">
            <span className="ui-field-label">Название *</span>
            <input
              className="ui-input"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
            />
          </label>
          <LookupSelect
            label="Направление"
            value={form.directionId}
            onChange={(value) => set('directionId', value)}
            items={[
              { value: '', label: 'не выбрано' },
              ...directions.map((d) => ({ value: d.id, label: d.name }))
            ]}
          />
          <label className="ui-field">
            <span className="ui-field-label">Описание</span>
            <textarea
              className="ui-textarea"
              rows={2}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </label>
        </FormSection>

        <FormSection title="Для документов">
          <label className="ui-field">
            <span className="ui-field-label">Наименование для документов</span>
            <textarea
              className="ui-textarea"
              rows={2}
              value={form.presentationTitle}
              onChange={(e) => set('presentationTitle', e.target.value)}
            />
            <span className="ui-hint">
              Печатается в удостоверениях и протоколах; пусто — печатается название курса.
            </span>
          </label>
          <LookupSelect
            label="Вид документа ФИС ФРДО"
            value={form.frdoDocumentKind}
            onChange={(value) => set('frdoDocumentKind', value)}
            items={[
              { value: '', label: 'не выбран' },
              ...frdoKinds.map((k) => ({ value: k.code, label: k.frdoKind }))
            ]}
          />
          <div className="ui-field">
            <span className="ui-field-label">Номер удостоверения — до трёх частей</span>
            <div className="ui-inline">
              {([0, 1, 2] as const).map((index) => (
                <input
                  key={index}
                  className="ui-input"
                  aria-label={`Часть номера ${index + 1}`}
                  value={form.certificateNumberParts[index]}
                  onChange={(e) => setPart(index, e.target.value)}
                />
              ))}
            </div>
          </div>
          <div className="ui-field">
            <span className="ui-field-label">Дополнительные поля для бланков</span>
            <span className="ui-hint">
              Например, «Присвоена квалификация» или «Разряд». Подпись — как поле называется в
              документе; ключ — латинское имя, по которому бланк находит поле (его сообщают тому,
              кто готовит бланк).
            </span>
            {form.docExtraFields.map((row, index) => (
              <div key={index} className="ui-inline">
                <input
                  className="ui-input"
                  aria-label="Подпись поля"
                  placeholder="Подпись"
                  value={row.label}
                  onChange={(e) => setExtra(index, { label: e.target.value })}
                />
                <input
                  className="ui-input"
                  aria-label="Ключ поля"
                  placeholder="ключ"
                  value={row.key}
                  onChange={(e) => setExtra(index, { key: e.target.value })}
                />
                <input
                  className="ui-input"
                  aria-label="Значение поля"
                  placeholder="Значение"
                  value={row.value}
                  onChange={(e) => setExtra(index, { value: e.target.value })}
                />
                <button
                  type="button"
                  className="ui-button-link"
                  onClick={() =>
                    set(
                      'docExtraFields',
                      form.docExtraFields.filter((_, i) => i !== index)
                    )
                  }
                >
                  Убрать поле
                </button>
              </div>
            ))}
            <div className="ui-form-actions">
              <button
                type="button"
                className="ui-button-link"
                onClick={() =>
                  set('docExtraFields', [...form.docExtraFields, { key: '', label: '', value: '' }])
                }
              >
                Добавить поле
              </button>
            </div>
          </div>
        </FormSection>

        <FormSection title="Учёт">
          <label className="ui-field">
            <span className="ui-field-label">Срок обучения по умолчанию, дней</span>
            <input
              className="ui-input"
              inputMode="numeric"
              value={form.periodDaysDefault}
              onChange={(e) => set('periodDaysDefault', e.target.value)}
            />
            <span className="ui-hint">Подставляется в курс группы, если срок там не задан.</span>
          </label>
          <label className="ui-field">
            <span className="ui-field-label">Цена, ₽</span>
            <input
              className="ui-input"
              inputMode="decimal"
              value={form.price}
              onChange={(e) => set('price', e.target.value)}
            />
          </label>
          <label className="ui-field">
            <span className="ui-field-label">Порядок в каталоге</span>
            <input
              className="ui-input"
              inputMode="numeric"
              value={form.sortNo}
              onChange={(e) => set('sortNo', e.target.value)}
            />
          </label>
          {canPickResponsible ? (
            <StaffSelect
              label="Ответственный за курс"
              value={form.responsibleUserId}
              selectedLabel={responsibleName}
              emptyLabel="— не назначен —"
              onChange={(userId, name) => {
                set('responsibleUserId', userId);
                setResponsibleName(name);
              }}
            />
          ) : null}
          <label className="ui-field">
            <span className="ui-field-label">Примечание</span>
            <textarea
              className="ui-textarea"
              rows={2}
              value={form.note}
              onChange={(e) => set('note', e.target.value)}
            />
          </label>
        </FormSection>

        {error !== null ? <SectionError error={error} /> : null}
        <div className="ui-modal-actions">
          <DrawerCancelButton className="ui-button" disabled={saving} onFallbackClose={onClose} />
          <button
            type="submit"
            className={`ui-button ui-button--primary ${saving ? 'ui-button--loading' : ''}`}
            disabled={saving}
            {...blockedProps(SAVE_KEY, problem)}
          >
            Сохранить основное
          </button>
          <BlockedHint hintKey={SAVE_KEY} reason={problem} />
        </div>
      </form>
    </DetailDrawer>
  );
}
