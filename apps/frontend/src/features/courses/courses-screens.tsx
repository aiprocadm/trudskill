'use client';

import { DataTable, FilterBar, ListPage, StatusChip } from '@trudskill/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { materialTypeLabel, publishBlockers, viewTimeLabel } from './labels';
import { FieldError } from '../../components/form-feedback';
import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../components/state-wrappers';
import { ApiClientError } from '../../lib/api/client';
import { hasPermission } from '../../lib/rbac/permissions';
import { useAuth } from '../auth/context';
import { useOtTrainingPrograms } from '../gov-export/hooks';
import {
  useCommissions,
  useCourse,
  useCourseDocumentSet,
  useCourseVersions,
  useCoursesList,
  useDirectionsList,
  useDocumentTemplates,
  useDomainMutations,
  useMaterials,
  useModules,
  useRegulatoryActs
} from '../mvp/hooks';
import { buildProgramMetaPatch } from '../mvp/payloads';
import { MutationError, formatDate, readApiMessage } from '../mvp/screen-helpers';
import { scormApi } from '../scorm/api';

import type {
  CourseDocumentSetEntryDraft,
  CourseVersion,
  FinalAssessmentForm,
  LearnerCategory,
  ProgramMetaPatch,
  StudyForm,
  TrainingType
} from '../mvp/types';
import type { ScormPackageDto } from '../scorm/types';
import type { ReactElement } from 'react';

const PAGE_SIZE = 20;

/** Состояния курса по-русски: общий `RegistryControls` печатал коды как есть. */
const COURSE_STATUS_OPTIONS = [
  { value: 'draft', label: 'Черновик' },
  { value: 'published', label: 'Опубликован' },
  { value: 'archived', label: 'В архиве' }
];

/*
 * Перенесены «как есть» из features/mvp/screens.tsx (§8.3, порядок 5; правило SCR-001:
 * перенос и редизайн — разные шаги). Редизайн — следующим коммитом.
 */

interface CourseRow {
  id: string;
  titleView: ReactElement;
  codeView: string;
  updatedView: string;
  statusView: ReactElement;
}

/*
 * TPL-001 (Фаза 4, срез 10, волна 3). Что изменилось:
 *
 * 1. Реестр был списком `<ul>` со ссылками и бейджем состояния — ни сравнить курсы,
 *    ни понять, когда их правили, было нельзя. Теперь таблица на каркасе `ListPage`.
 * 2. Отбор по состоянию показывал КОДЫ (`draft`, `published`, `archived` и ещё шесть)
 *    — общий `RegistryControls` монолита печатает значения как есть.
 * 3. «Нет курсов» — пустой экран без объяснения и без первого действия (`CMP-014`).
 * 4. Право на создание сообщалось надписью «Недостаточно прав для создания курса»
 *    вместо того, чтобы просто не показывать кнопку.
 */
export const CoursesPageScreen = () => {
  const { session } = useAuth();
  const canCreateCourse = hasPermission(session?.permissions ?? [], 'courses.write');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [directionId, setDirectionId] = useState('');
  const [page, setPage] = useState(1);
  const { data, loading, error, refetch } = useCoursesList({
    q,
    status,
    page,
    page_size: PAGE_SIZE,
    direction_id: directionId || undefined
  });
  const { data: directions } = useDirectionsList({ page: 1, page_size: 100 });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  const rows: CourseRow[] = (data?.items ?? []).map((course) => ({
    id: course.id,
    titleView: (
      <Link className="ui-link" href={`/courses/${course.id}`}>
        {course.title}
      </Link>
    ),
    codeView: course.code || '—',
    updatedView: formatDate(course.updatedAt),
    statusView: <StatusChip status={course.status} />
  }));

  return (
    <PageContainer>
      <PageHeader
        title="Курсы"
        subtitle="Программы обучения центра: состав модулей, часы, правила аттестации"
        actions={
          canCreateCourse ? (
            <Link className="ui-button--primary" href="/courses/new">
              Создать курс
            </Link>
          ) : null
        }
      />

      <FilterBar
        activeCount={[q, status, directionId].filter(Boolean).length}
        onReset={() => {
          setQ('');
          setStatus('');
          setDirectionId('');
          setPage(1);
        }}
        primary={
          <>
            <label className="ui-field">
              <span className="ui-field-label">Поиск по названию</span>
              <input
                value={q}
                onChange={(event) => {
                  setQ(event.target.value);
                  setPage(1);
                }}
              />
            </label>
            <label className="ui-field">
              <span className="ui-field-label">Направление</span>
              <select
                value={directionId}
                onChange={(event) => {
                  setDirectionId(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">Все направления</option>
                {directions?.items.map((direction) => (
                  <option key={direction.id} value={direction.id}>
                    {direction.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="ui-field">
              <span className="ui-field-label">Статус</span>
              <select
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">Любое</option>
                {COURSE_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        }
      />

      <ListPage<CourseRow>
        columns={[
          { key: 'titleView', title: 'Курс', render: (row) => row.titleView },
          { key: 'codeView', title: 'Код' },
          { key: 'updatedView', title: 'Изменён' },
          { key: 'statusView', title: 'Статус', render: (row) => row.statusView }
        ]}
        rows={rows}
        isLoading={loading}
        error={error ? new Error(error) : undefined}
        onRetry={() => void refetch()}
        rowKey={(row) => row.id}
        emptyMessage="Здесь появятся курсы"
        emptyHint="Курс — программа обучения: модули с материалами, часы и правила итоговой аттестации. По курсу собираются учебные группы."
        {...(canCreateCourse
          ? { emptyAction: { label: 'Создать первый курс', href: '/courses/new' } }
          : {})}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
      />
    </PageContainer>
  );
};

/*
 * Здесь лежал `CourseCreateScreen` — 212 строк, на которые НЕ ССЫЛАЛСЯ никто.
 * Маршрут `/courses/new` открывает `features/course-wizard/screens.tsx`: настоящий мастер
 * из пяти шагов с черновиком, сделанный в §5.200. Старый экран остался в монолите после
 * той замены и с тех пор был недостижим. Переносить мёртвый код в новую папку — значит
 * закрепить его навсегда, поэтому он удалён (журнал расхождений).
 */

const TRAINING_TYPE_OPTIONS: Array<{ value: TrainingType; label: string }> = [
  { value: 'primary', label: 'Первичная' },
  { value: 'repeat', label: 'Повторная' },
  { value: 'target', label: 'Целевая' },
  { value: 'extraordinary', label: 'Внеочередная' }
];
const LEARNER_CATEGORY_OPTIONS: Array<{ value: LearnerCategory; label: string }> = [
  { value: 'worker', label: 'Рабочие' },
  { value: 'specialist', label: 'Специалисты' },
  { value: 'manager', label: 'Руководители' },
  { value: 'mixed', label: 'Смешанная' }
];
const STUDY_FORM_OPTIONS: Array<{ value: StudyForm; label: string }> = [
  { value: 'in_person', label: 'Очная' },
  { value: 'distance', label: 'Дистанционная' },
  { value: 'blended', label: 'Смешанная' }
];
const FINAL_ASSESSMENT_OPTIONS: Array<{ value: FinalAssessmentForm; label: string }> = [
  { value: 'test', label: 'Тест' },
  { value: 'exam', label: 'Экзамен' },
  { value: 'defense', label: 'Защита' },
  { value: 'interview', label: 'Собеседование' }
];

const ProgramMetaSection = ({
  courseVersion,
  onUpdated
}: {
  courseVersion: CourseVersion;
  onUpdated: () => void | Promise<void>;
}) => {
  const { data: acts } = useRegulatoryActs();
  const { data: otPrograms } = useOtTrainingPrograms();
  const { data: commissions } = useCommissions('active');
  const { updateCourseVersionProgramMeta, publishCourseVersion } = useDomainMutations();
  const readOnly = courseVersion.status !== 'draft';

  const [academicHours, setAcademicHours] = useState<string>(
    courseVersion.academicHours != null ? String(courseVersion.academicHours) : ''
  );
  const [trainingType, setTrainingType] = useState<TrainingType | ''>(
    courseVersion.trainingType ?? ''
  );
  const [learnerCategory, setLearnerCategory] = useState<LearnerCategory | ''>(
    courseVersion.learnerCategory ?? ''
  );
  const [studyForm, setStudyForm] = useState<StudyForm | ''>(courseVersion.studyForm ?? '');
  const [finalAssessmentForm, setFinalAssessmentForm] = useState<FinalAssessmentForm | ''>(
    courseVersion.finalAssessmentForm ?? ''
  );
  const [regulatoryBasisCodes, setRegulatoryBasisCodes] = useState<string[]>(
    courseVersion.regulatoryBasisCodes ?? []
  );
  const [commissionId, setCommissionId] = useState<string>(courseVersion.commissionId ?? '');
  const [otProgramCodes, setOtProgramCodes] = useState<string[]>(
    courseVersion.otProgramCodes ?? []
  );
  // Фаза 2 Tasks 6/7 — правила видео-уроков курса (ФТ-B3.1/B3.2).
  const [videoCompletionPercent, setVideoCompletionPercent] = useState<string>(
    courseVersion.videoCompletionPercent != null ? String(courseVersion.videoCompletionPercent) : ''
  );
  const [noSeekOnFirstView, setNoSeekOnFirstView] = useState<boolean>(
    Boolean(courseVersion.noSeekOnFirstView)
  );
  const [sequentialModules, setSequentialModules] = useState<boolean>(
    Boolean(courseVersion.sequentialModules)
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setAcademicHours(
      courseVersion.academicHours != null ? String(courseVersion.academicHours) : ''
    );
    setTrainingType(courseVersion.trainingType ?? '');
    setLearnerCategory(courseVersion.learnerCategory ?? '');
    setStudyForm(courseVersion.studyForm ?? '');
    setFinalAssessmentForm(courseVersion.finalAssessmentForm ?? '');
    setRegulatoryBasisCodes(courseVersion.regulatoryBasisCodes ?? []);
    setCommissionId(courseVersion.commissionId ?? '');
    setOtProgramCodes(courseVersion.otProgramCodes ?? []);
    setVideoCompletionPercent(
      courseVersion.videoCompletionPercent != null
        ? String(courseVersion.videoCompletionPercent)
        : ''
    );
    setNoSeekOnFirstView(Boolean(courseVersion.noSeekOnFirstView));
    setSequentialModules(Boolean(courseVersion.sequentialModules));
  }, [courseVersion]);

  // EDIT form pre-populates current values, so we always send every field: a real value
  // updates, an explicit clearing value (null / []) unsets it. See payloads.ts.
  const buildPayload = (): ProgramMetaPatch =>
    buildProgramMetaPatch({
      academicHours,
      trainingType,
      learnerCategory,
      studyForm,
      finalAssessmentForm,
      regulatoryBasisCodes,
      commissionId,
      otProgramCodes,
      videoCompletionPercent,
      noSeekOnFirstView,
      sequentialModules
    });

  const onSave = async () => {
    setBusy(true);
    setError(null);
    try {
      await updateCourseVersionProgramMeta(courseVersion.id, buildPayload());
      await onUpdated();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось сохранить параметры');
    } finally {
      setBusy(false);
    }
  };

  const onPublish = async () => {
    setBusy(true);
    setError(null);
    try {
      await updateCourseVersionProgramMeta(courseVersion.id, buildPayload());
      await publishCourseVersion(courseVersion.id);
      await onUpdated();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось опубликовать');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard title="Нормативные параметры программы">
      {readOnly ? (
        <p className="ui-text-muted">
          Версия опубликована — параметры доступны только для просмотра.
        </p>
      ) : null}
      <div className="ui-stack" style={{ gap: 12 }}>
        <label>
          Часы (академические)
          <input
            type="number"
            min={1}
            value={academicHours}
            onChange={(e) => setAcademicHours(e.target.value)}
            disabled={readOnly}
          />
        </label>
        <label>
          Вид подготовки
          <select
            value={trainingType}
            onChange={(e) => setTrainingType(e.target.value as TrainingType | '')}
            disabled={readOnly}
          >
            <option value="">— выберите —</option>
            {TRAINING_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Категория обучаемых
          <select
            value={learnerCategory}
            onChange={(e) => setLearnerCategory(e.target.value as LearnerCategory | '')}
            disabled={readOnly}
          >
            <option value="">— выберите —</option>
            {LEARNER_CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Форма обучения
          <select
            value={studyForm}
            onChange={(e) => setStudyForm(e.target.value as StudyForm | '')}
            disabled={readOnly}
          >
            <option value="">— выберите —</option>
            {STUDY_FORM_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Форма аттестации
          <select
            value={finalAssessmentForm}
            onChange={(e) => setFinalAssessmentForm(e.target.value as FinalAssessmentForm | '')}
            disabled={readOnly}
          >
            <option value="">— выберите —</option>
            {FINAL_ASSESSMENT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Нормативные акты (множественный выбор)
          <select
            multiple
            value={regulatoryBasisCodes}
            onChange={(e) =>
              setRegulatoryBasisCodes(Array.from(e.target.selectedOptions, (o) => o.value))
            }
            disabled={readOnly}
            size={6}
          >
            {acts?.items.map((a) => (
              <option key={a.code} value={a.code}>
                {a.shortName} — {a.fullName}
              </option>
            ))}
          </select>
        </label>
        <label>
          Программы реестра ОТ (Минтруд)
          <select
            multiple
            value={otProgramCodes}
            onChange={(e) =>
              setOtProgramCodes(Array.from(e.target.selectedOptions, (o) => o.value))
            }
            disabled={readOnly}
            size={6}
          >
            {otPrograms?.map((p) => (
              <option key={p.code} value={p.code}>
                {p.registryId}. {p.exactName}
              </option>
            ))}
          </select>
        </label>
        <label>
          Зачёт видео-урока, % просмотра
          <input
            type="number"
            min="1"
            max="100"
            value={videoCompletionPercent}
            onChange={(e) => setVideoCompletionPercent(e.target.value)}
            disabled={readOnly}
            placeholder="90"
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={noSeekOnFirstView}
            onChange={(e) => setNoSeekOnFirstView(e.target.checked)}
            disabled={readOnly}
          />
          Запретить перемотку вперёд при первом просмотре
        </label>
        <label>
          <input
            type="checkbox"
            checked={sequentialModules}
            onChange={(e) => setSequentialModules(e.target.checked)}
            disabled={readOnly}
          />
          Строгий порядок модулей: следующий открывается после закрытия предыдущего
        </label>
        <label>
          Аттестационная комиссия
          <select
            value={commissionId}
            onChange={(e) => setCommissionId(e.target.value)}
            disabled={readOnly}
          >
            <option value="">— выберите комиссию —</option>
            {commissions?.items.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.name}
              </option>
            ))}
          </select>
        </label>
        {error ? <FieldError id="program-meta-error" message={error} /> : null}
        {!readOnly ? (
          <div className="ui-inline" style={{ gap: 8 }}>
            <button
              type="button"
              className="ui-button"
              disabled={busy}
              onClick={() => void onSave()}
            >
              Сохранить черновик
            </button>
            <button
              type="button"
              className="ui-button"
              disabled={busy}
              onClick={() => void onPublish()}
            >
              Опубликовать версию
            </button>
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
};

const DocumentSetSection = ({
  courseVersion,
  onUpdated
}: {
  courseVersion: CourseVersion;
  onUpdated: () => void | Promise<void>;
}) => {
  const { data: existing, refetch: refetchSet } = useCourseDocumentSet(courseVersion.id);
  const { data: templates } = useDocumentTemplates();
  const { setCourseDocumentSet } = useDomainMutations();

  const [draft, setDraft] = useState<CourseDocumentSetEntryDraft[]>([]);
  const [nextTemplate, setNextTemplate] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (existing) {
      setDraft(
        existing.items
          .slice()
          .sort((a, b) => a.position - b.position)
          .map((e) => ({
            templateId: e.templateId,
            position: e.position,
            isRequired: e.isRequired,
            autoIssueOnCompletion: e.autoIssueOnCompletion
          }))
      );
    }
  }, [existing]);

  const renumber = (arr: CourseDocumentSetEntryDraft[]): CourseDocumentSetEntryDraft[] =>
    arr.map((e, i) => ({ ...e, position: i }));

  const addEntry = (templateId: string) => {
    if (!templateId) return;
    setDraft((prev) =>
      renumber([
        ...prev,
        {
          templateId,
          position: prev.length,
          isRequired: true,
          autoIssueOnCompletion: true
        }
      ])
    );
  };

  const move = (idx: number, delta: number) => {
    setDraft((prev) => {
      const newIdx = idx + delta;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const arr = [...prev];
      const cur = arr[idx];
      const target = arr[newIdx];
      if (!cur || !target) return prev;
      arr[idx] = target;
      arr[newIdx] = cur;
      return renumber(arr);
    });
  };

  const removeEntry = (idx: number) => {
    setDraft((prev) => renumber(prev.filter((_, i) => i !== idx)));
  };

  const toggleField = (idx: number, field: 'isRequired' | 'autoIssueOnCompletion') => {
    setDraft((prev) => prev.map((e, i) => (i === idx ? { ...e, [field]: !e[field] } : e)));
  };

  const onSave = async () => {
    setBusy(true);
    setError(null);
    try {
      await setCourseDocumentSet(courseVersion.id, draft);
      await refetchSet();
      await onUpdated();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось сохранить пакет');
    } finally {
      setBusy(false);
    }
  };

  const templateNameById: Record<string, { name: string; templateType: string }> = {};
  templates?.items.forEach((t) => {
    templateNameById[t.id] = { name: t.name, templateType: t.templateType };
  });

  return (
    <SectionCard title="Документы по окончании курса">
      <p className="ui-text-muted" style={{ marginBottom: 8 }}>
        Документы выпускаются по порядку при завершении зачисления. Шаблоны привязаны к tenant.
      </p>
      {draft.length === 0 ? (
        <SectionEmpty
          message="Пакет ещё не настроен"
          hint="Набор документов определяет, что выпускается слушателю по окончании курса."
        />
      ) : null}
      {draft.map((entry, idx) => {
        const info = templateNameById[entry.templateId];
        return (
          <div
            key={`${entry.templateId}_${idx}`}
            className="ui-inline"
            style={{ gap: 8, padding: '6px 0', borderBottom: '1px solid var(--ui-border)' }}
          >
            <strong>{idx + 1}.</strong>
            <span>{info?.name ?? `(${entry.templateId} — не найден)`}</span>
            <span className="ui-text-muted">{info?.templateType}</span>
            <label>
              <input
                type="checkbox"
                checked={entry.isRequired}
                onChange={() => toggleField(idx, 'isRequired')}
              />{' '}
              Обязательный
            </label>
            <label>
              <input
                type="checkbox"
                checked={entry.autoIssueOnCompletion}
                onChange={() => toggleField(idx, 'autoIssueOnCompletion')}
              />{' '}
              Авто-выпуск
            </label>
            <button
              type="button"
              className="ui-button-link"
              onClick={() => move(idx, -1)}
              disabled={idx === 0}
            >
              ↑
            </button>
            <button
              type="button"
              className="ui-button-link"
              onClick={() => move(idx, 1)}
              disabled={idx === draft.length - 1}
            >
              ↓
            </button>
            <button type="button" className="ui-button-link" onClick={() => removeEntry(idx)}>
              Удалить
            </button>
          </div>
        );
      })}

      <div className="ui-inline" style={{ gap: 8, marginTop: 8 }}>
        <select value={nextTemplate} onChange={(e) => setNextTemplate(e.target.value)}>
          <option value="">— выберите шаблон —</option>
          {templates?.items.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.templateType})
            </option>
          ))}
        </select>
        <button
          type="button"
          className="ui-button"
          onClick={() => {
            if (nextTemplate) {
              addEntry(nextTemplate);
              setNextTemplate('');
            }
          }}
          disabled={!nextTemplate}
        >
          Добавить в пакет
        </button>
      </div>

      {error ? <FieldError id="document-set-error" message={error} /> : null}
      <div className="ui-inline" style={{ gap: 8, marginTop: 12 }}>
        <button type="button" className="ui-button" disabled={busy} onClick={() => void onSave()}>
          Сохранить пакет
        </button>
      </div>
    </SectionCard>
  );
};

export const CourseDetailsScreen = ({ id }: { id: string }) => {
  const { session } = useAuth();
  const { data: course, refetch } = useCourse(id);
  const { data: versions, refetch: refetchVersions } = useCourseVersions(id);
  const latestVersionId = versions?.items[versions.items.length - 1]?.id;
  const latestVersion = versions?.items[versions.items.length - 1];
  const { data: modules, refetch: refetchModules } = useModules(latestVersionId);
  const [selectedModuleId, setSelectedModuleId] = useState<string>('');
  const { data: materials, refetch: refetchMaterials } = useMaterials(selectedModuleId);
  const { publishCourse, archiveCourse, createCourseVersion, saveModule, saveMaterial } =
    useDomainMutations();
  const [moduleTitle, setModuleTitle] = useState('');
  const [materialTitle, setMaterialTitle] = useState('');
  const [materialType, setMaterialType] = useState<
    'text' | 'video' | 'file' | 'external_url' | 'scorm'
  >('text');
  const [scormPackageId, setScormPackageId] = useState<string>('');
  const [scormPackages, setScormPackages] = useState<ScormPackageDto[]>([]);
  const [scormPackagesLoaded, setScormPackagesLoaded] = useState(false);
  const [scormPackagesError, setScormPackagesError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const canPublish = hasPermission(session?.permissions ?? [], 'courses.publish');
  const canArchive = hasPermission(session?.permissions ?? [], 'courses.archive');

  useEffect(() => {
    if (modules?.items?.length && !selectedModuleId) {
      setSelectedModuleId(modules.items[0]?.id ?? '');
    }
  }, [modules, selectedModuleId]);

  // Lazy-load ready SCORM packages when the scorm material type is first selected
  useEffect(() => {
    if (materialType !== 'scorm' || scormPackagesLoaded || !session) return;
    scormApi
      .list(session)
      .then((resp) => {
        setScormPackages(resp.items.filter((p) => p.packageStatus === 'ready'));
        setScormPackagesLoaded(true);
        setScormPackagesError(null);
      })
      .catch(() => {
        setScormPackagesLoaded(true);
        setScormPackagesError('Не удалось загрузить SCORM-пакеты');
      });
  }, [materialType, scormPackagesLoaded, session]);

  const blockers = publishBlockers({
    hasVersion: Boolean(latestVersionId),
    hasModule: Boolean(modules?.items?.length),
    hasMaterial: Boolean(materials?.items?.length)
  });
  const readyToPublish = blockers.length === 0;

  return (
    <PageContainer>
      <PageHeader
        title={course?.title ?? 'Курс'}
        subtitle="Программа обучения: версии, модули и материалы"
        actions={
          /* UI-007: одно первичное действие. Архивирование — вторичное, рядом. */
          <span className="ui-inline">
            {canArchive ? (
              <button
                type="button"
                className="ui-button-secondary"
                onClick={() =>
                  void archiveCourse(id)
                    .then(refetch)
                    .catch((archiveError) => setSaveError(readApiMessage(archiveError)))
                }
              >
                В архив
              </button>
            ) : null}
            {canPublish ? (
              <button
                type="button"
                className="ui-button--primary"
                disabled={!readyToPublish}
                onClick={() =>
                  void publishCourse(id)
                    .then(refetch)
                    .catch((publishError) => setSaveError(readApiMessage(publishError)))
                }
              >
                Опубликовать курс
              </button>
            ) : null}
          </span>
        }
      />
      <MutationError message={saveError} />
      <SectionCard title="Версии программы">
        <p className="ui-hint">
          Новая версия нужна, когда программа меняется, а прежние выпуски документов должны остаться
          привязанными к старой редакции.
        </p>
        {versions?.items.length ? (
          <DataTable
            columns={[
              { key: 'versionView', title: 'Версия' },
              { key: 'stateView', title: 'Статус', render: (row) => row.stateView }
            ]}
            rows={versions.items.map((item) => ({
              id: item.id,
              versionView: `Версия ${item.versionNo}`,
              stateView: <StatusChip status={item.status} />
            }))}
            rowKey={(row) => String(row.id)}
          />
        ) : (
          <SectionEmpty
            message="Версий пока нет"
            hint="Пока нет версии, курс нельзя наполнить модулями и опубликовать."
          />
        )}
        <button
          type="button"
          className="ui-button-secondary"
          onClick={() => void createCourseVersion(id).then(refetchVersions)}
        >
          Добавить версию
        </button>
      </SectionCard>
      {latestVersion ? (
        <>
          <ProgramMetaSection
            courseVersion={latestVersion}
            onUpdated={async () => {
              await refetchVersions();
            }}
          />
          <DocumentSetSection
            courseVersion={latestVersion}
            onUpdated={async () => {
              await refetchVersions();
            }}
          />
        </>
      ) : null}
      <SectionCard title="Модули">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!latestVersionId || !moduleTitle.trim()) return;
            void saveModule(null, {
              courseVersionId: latestVersionId,
              title: moduleTitle.trim(),
              minViewSeconds: 0,
              isRequired: true
            })
              .then(() => {
                setModuleTitle('');
                return refetchModules();
              })
              .catch((moduleError) => setSaveError(readApiMessage(moduleError)));
          }}
          className="ui-inline"
          style={{ marginBottom: 8 }}
        >
          <input
            value={moduleTitle}
            onChange={(event) => setModuleTitle(event.target.value)}
            placeholder="Название модуля"
          />
          <button type="submit" disabled={!latestVersionId}>
            Добавить модуль
          </button>
        </form>
        {modules?.items.length ? (
          <DataTable
            columns={[
              { key: 'orderView', title: '№' },
              { key: 'title', title: 'Модуль' },
              { key: 'viewTimeView', title: 'Минимум просмотра' }
            ]}
            rows={modules.items.map((item) => ({
              id: item.id,
              orderView: item.sortOrder + 1,
              title: item.title,
              viewTimeView: viewTimeLabel(item.minViewSeconds)
            }))}
            rowKey={(row) => String(row.id)}
          />
        ) : (
          <SectionEmpty
            message="Модулей пока нет"
            hint="Модуль — раздел программы; внутри него лежат материалы, которые изучает слушатель."
          />
        )}
      </SectionCard>
      <SectionCard title="Материалы модуля">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!selectedModuleId || !materialTitle.trim()) return;
            void saveMaterial(null, {
              moduleId: selectedModuleId,
              title: materialTitle.trim(),
              materialType,
              minViewSeconds: materialType === 'scorm' ? 0 : 60,
              isRequired: true,
              ...(materialType === 'scorm' && scormPackageId ? { scormPackageId } : {})
            })
              .then(() => {
                setMaterialTitle('');
                setScormPackageId('');
                return refetchMaterials();
              })
              .catch((materialError) => setSaveError(readApiMessage(materialError)));
          }}
          className="ui-inline"
          style={{ marginBottom: 8 }}
        >
          <select
            value={selectedModuleId}
            onChange={(event) => setSelectedModuleId(event.target.value)}
          >
            <option value="">Выберите модуль</option>
            {modules?.items.map((module) => (
              <option key={module.id} value={module.id}>
                {module.title}
              </option>
            ))}
          </select>
          <input
            value={materialTitle}
            onChange={(event) => setMaterialTitle(event.target.value)}
            placeholder="Название материала"
          />
          <select
            value={materialType}
            onChange={(event) => {
              setMaterialType(event.target.value as typeof materialType);
              setScormPackageId('');
            }}
          >
            <option value="text">Текст</option>
            <option value="video">Видео</option>
            <option value="file">Файл</option>
            <option value="external_url">Внешняя ссылка</option>
            <option value="scorm">SCORM</option>
          </select>
          {materialType === 'scorm' ? (
            <>
              {scormPackagesError ? (
                <SectionError message={scormPackagesError} />
              ) : (
                <select
                  value={scormPackageId}
                  onChange={(event) => setScormPackageId(event.target.value)}
                >
                  <option value="">— выберите SCORM-пакет —</option>
                  {scormPackages.map((pkg) => (
                    <option key={pkg.id} value={pkg.id}>
                      {pkg.title}
                    </option>
                  ))}
                </select>
              )}
            </>
          ) : null}
          <button
            type="submit"
            disabled={!selectedModuleId || (materialType === 'scorm' && !scormPackageId)}
          >
            Добавить материал
          </button>
        </form>
        {materials?.items.length ? (
          <DataTable
            columns={[
              { key: 'orderView', title: '№' },
              { key: 'title', title: 'Материал' },
              { key: 'typeView', title: 'Вид' },
              { key: 'viewTimeView', title: 'Минимум просмотра' }
            ]}
            rows={materials.items.map((item) => ({
              id: item.id,
              orderView: item.sortOrder + 1,
              title: item.title,
              typeView: materialTypeLabel(item.materialType),
              viewTimeView: viewTimeLabel(item.minViewSeconds)
            }))}
            rowKey={(row) => String(row.id)}
          />
        ) : (
          <SectionEmpty
            message="Материалов пока нет"
            hint="Материал — то, что слушатель читает или смотрит: текст, видео, файл или учебный пакет."
          />
        )}
      </SectionCard>

      {canPublish && !readyToPublish ? (
        <SectionCard title="Что мешает опубликовать курс">
          {/* Было одной фразой «требуется минимум 1 версия, 1 модуль и 1 материал» —
              человек не понимал, чего именно не хватает ЕМУ. */}
          <ul className="ui-bare-list">
            {blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </SectionCard>
      ) : null}
    </PageContainer>
  );
};

// Экраны групп переехали в features/groups/ (Фаза 4 срез 2, SCR-001).
