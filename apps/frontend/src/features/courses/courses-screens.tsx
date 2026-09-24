'use client';

import { DataTable, KeyValueList, ListPage, PageTabs, StatusChip, TabPanel } from '@trudskill/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { canArchiveCourse, courseHeaderAction } from './course-actions';
import { CourseBasicsSection } from './course-basics-section';
import {
  COURSE_TABS,
  assessmentSummary,
  coursePreviewHref,
  finalExamOf,
  moduleTestsOf,
  resolveCourseTab
} from './course-card';
import { materialTypeLabel, publishBlockers, viewTimeLabel } from './labels';
import {
  FINAL_ASSESSMENT_OPTIONS,
  LEARNER_CATEGORY_OPTIONS,
  STUDY_FORM_OPTIONS,
  TRAINING_TYPE_OPTIONS,
  programMetaView
} from './program-meta-view';
import { canMove, moduleSummary, movedByOne } from './program-tree';
import { useProgramTree } from './use-program-tree';
import { FieldError } from '../../components/form-feedback';
import {
  PageContainer,
  PageHeader,
  RecordNotFound,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../components/state-wrappers';
import { useUnsavedForm } from '../../components/use-unsaved-form';
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
  useRegulatoryActs,
  useTests
} from '../mvp/hooks';
import { buildProgramMetaPatch } from '../mvp/payloads';
import { MutationError, formatDate, readApiMessage } from '../mvp/screen-helpers';
import { useObjectCrumb } from '../navigation/use-object-crumb';
import { useTabParam } from '../navigation/use-tab-param';
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
        {...(canCreateCourse
          ? { primaryAction: { label: 'Создать курс', href: '/courses/new' } }
          : {})}
      />

      <ListPage<CourseRow>
        /*
          ТЗ 5.6 (Э6): панель отбора — слот каркаса, а не отдельный блок рядом. Порядок
          «быстрые отборы → поиск и фильтры → колонки → таблица → массовые действия»
          считает каркас, экран лишь передаёт содержимое.
        */
        filters={
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
        activeFilterCount={[q, status, directionId].filter(Boolean).length}
        onResetFilters={() => {
          setQ('');
          setStatus('');
          setDirectionId('');
          setPage(1);
        }}
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

/*
 * Списки подписей переехали в `program-meta-view.ts` (ТЗ 5.10): их читает и форма, и режим
 * просмотра. Два списка разошлись бы, и один и тот же вид подготовки назывался бы по-разному.
 */

/**
 * Один уровень вкладок карточки курса (ТЗ 5.7 / Э7).
 *
 * Было шесть блоков одной лентой: версии, нормативные параметры, пакет документов, модули,
 * материалы модуля и подсказка «что мешает опубликовать». Методист, который пришёл добавить
 * материал, прокручивал мимо всего остального — а «что мешает опубликовать» оказывалось в
 * самом низу, там, где его уже не ищут (журнал 462).
 *
 * «Состав» первым: добавление модулей и материалов — самая частая работа с курсом.
 */
const ProgramMetaSection = ({
  courseVersion,
  onUpdated,
  onCreateVersion
}: {
  courseVersion: CourseVersion;
  onUpdated: () => void | Promise<void>;
  /** ТЗ 5.10: из режима просмотра ведёт единственный путь к правке — новая версия. */
  onCreateVersion?: () => void;
}) => {
  const { data: acts } = useRegulatoryActs();
  const { data: otPrograms } = useOtTrainingPrograms();
  const { data: commissions } = useCommissions('active');
  const { updateCourseVersionProgramMeta, publishCourseVersion } = useDomainMutations();
  const readOnly = courseVersion.status !== 'draft';

  /* Коды в значениях запрещены: справочники переводят их в имена (Э6, «ни одного сырого кода»). */
  const dictionaries = {
    acts: new Map((acts?.items ?? []).map((a) => [a.code, a.shortName])),
    otPrograms: new Map((otPrograms?.items ?? []).map((p) => [p.code, p.exactName])),
    commissions: new Map((commissions?.items ?? []).map((c) => [c.id, `${c.code} — ${c.name}`]))
  };

  /*
   * Что должно лежать в форме: значения сохранённой версии курса. Вынесено функцией, потому
   * что это знание нужно в ТРЁХ местах — при первой отрисовке, при обновлении версии и при
   * сравнении «что человек изменил» (защита от потери правок, ТЗ 10.3). Три копии одного
   * списка разъехались бы при первом же новом поле.
   */
  const savedForm = {
    academicHours: courseVersion.academicHours != null ? String(courseVersion.academicHours) : '',
    trainingType: (courseVersion.trainingType ?? '') as TrainingType | '',
    learnerCategory: (courseVersion.learnerCategory ?? '') as LearnerCategory | '',
    studyForm: (courseVersion.studyForm ?? '') as StudyForm | '',
    finalAssessmentForm: (courseVersion.finalAssessmentForm ?? '') as FinalAssessmentForm | '',
    regulatoryBasisCodes: courseVersion.regulatoryBasisCodes ?? [],
    commissionId: courseVersion.commissionId ?? '',
    otProgramCodes: courseVersion.otProgramCodes ?? [],
    // Фаза 2 Tasks 6/7 — правила видео-уроков курса (ФТ-B3.1/B3.2).
    videoCompletionPercent:
      courseVersion.videoCompletionPercent != null
        ? String(courseVersion.videoCompletionPercent)
        : '',
    noSeekOnFirstView: Boolean(courseVersion.noSeekOnFirstView),
    sequentialModules: Boolean(courseVersion.sequentialModules)
  };

  const [academicHours, setAcademicHours] = useState<string>(savedForm.academicHours);
  const [trainingType, setTrainingType] = useState<TrainingType | ''>(savedForm.trainingType);
  const [learnerCategory, setLearnerCategory] = useState<LearnerCategory | ''>(
    savedForm.learnerCategory
  );
  const [studyForm, setStudyForm] = useState<StudyForm | ''>(savedForm.studyForm);
  const [finalAssessmentForm, setFinalAssessmentForm] = useState<FinalAssessmentForm | ''>(
    savedForm.finalAssessmentForm
  );
  const [regulatoryBasisCodes, setRegulatoryBasisCodes] = useState<string[]>(
    savedForm.regulatoryBasisCodes
  );
  const [commissionId, setCommissionId] = useState<string>(savedForm.commissionId);
  const [otProgramCodes, setOtProgramCodes] = useState<string[]>(savedForm.otProgramCodes);
  const [videoCompletionPercent, setVideoCompletionPercent] = useState<string>(
    savedForm.videoCompletionPercent
  );
  const [noSeekOnFirstView, setNoSeekOnFirstView] = useState<boolean>(savedForm.noSeekOnFirstView);
  const [sequentialModules, setSequentialModules] = useState<boolean>(savedForm.sequentialModules);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setAcademicHours(savedForm.academicHours);
    setTrainingType(savedForm.trainingType);
    setLearnerCategory(savedForm.learnerCategory);
    setStudyForm(savedForm.studyForm);
    setFinalAssessmentForm(savedForm.finalAssessmentForm);
    setRegulatoryBasisCodes(savedForm.regulatoryBasisCodes);
    setCommissionId(savedForm.commissionId);
    setOtProgramCodes(savedForm.otProgramCodes);
    setVideoCompletionPercent(savedForm.videoCompletionPercent);
    setNoSeekOnFirstView(savedForm.noSeekOnFirstView);
    setSequentialModules(savedForm.sequentialModules);
  }, [courseVersion]);

  /* Защита от потери правок (ТЗ 10.3): исходное — сохранённая версия курса. */
  const unsavedGuard = useUnsavedForm(
    {
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
    },
    { saving: busy, initial: savedForm }
  );

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

  /*
   * ТЗ 5.10 (Э10): у опубликованной версии значения показываются ТЕКСТОМ, а не выключенными
   * полями ввода. Раньше над формой стояла надпись «только для просмотра», а под ней —
   * одиннадцать обычных на вид полей: человек щёлкал в «Часы (академические)» и не понимал,
   * почему не печатается (журнал 472).
   */
  if (readOnly) {
    return (
      <SectionCard title="Нормативные параметры программы">
        <p className="ui-text-muted">
          Версия опубликована — параметры доступны только для просмотра. Чтобы изменить их, создайте
          новую версию: прежние выпуски документов останутся привязанными к этой.
        </p>
        <KeyValueList items={programMetaView(courseVersion, dictionaries)} />
        {onCreateVersion ? (
          <button type="button" className="ui-button" onClick={onCreateVersion}>
            Создать новую версию, чтобы изменить
          </button>
        ) : null}
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Нормативные параметры программы">
      {unsavedGuard}
      <div className="ui-stack" style={{ gap: 12 }}>
        <label>
          Часы (академические)
          <input
            type="number"
            min={1}
            value={academicHours}
            onChange={(e) => setAcademicHours(e.target.value)}
          />
        </label>
        <label>
          Вид подготовки
          <select
            value={trainingType}
            onChange={(e) => setTrainingType(e.target.value as TrainingType | '')}
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
            size={6}
          >
            {otPrograms?.items.map((p) => (
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
            placeholder="90"
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={noSeekOnFirstView}
            onChange={(e) => setNoSeekOnFirstView(e.target.checked)}
          />
          Запретить перемотку вперёд при первом просмотре
        </label>
        <label>
          <input
            type="checkbox"
            checked={sequentialModules}
            onChange={(e) => setSequentialModules(e.target.checked)}
          />
          Строгий порядок модулей: следующий открывается после закрытия предыдущего
        </label>
        <label>
          Аттестационная комиссия
          <select value={commissionId} onChange={(e) => setCommissionId(e.target.value)}>
            <option value="">— выберите комиссию —</option>
            {commissions?.items.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.name}
              </option>
            ))}
          </select>
        </label>
        {error ? <FieldError id="program-meta-error" message={error} /> : null}
        {/*
          ТЗ 5.10: ветка просмотра возвращается выше, поэтому здесь форма всегда живая —
          проверка `!readOnly` была бы мёртвой.
        */}
        <div className="ui-inline" style={{ gap: 8 }}>
          <button type="button" className="ui-button" disabled={busy} onClick={() => void onSave()}>
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
        Документы выпускаются по порядку при завершении зачисления. Шаблоны — из документов вашего
        учебного центра.
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
            {/*
              Стрелка без подписи требует догадки, а незрячему читается как «стрелка вверх»
              (прецедент — журнал 86). Значок оставлен глазу, смысл — в подписи для
              вспомогательных технологий.
            */}
            <button
              type="button"
              className="ui-button-link"
              onClick={() => move(idx, -1)}
              disabled={idx === 0}
              aria-label="Поднять выше в программе"
              title="Поднять выше в программе"
            >
              <span aria-hidden="true">↑</span>
            </button>
            <button
              type="button"
              className="ui-button-link"
              onClick={() => move(idx, 1)}
              disabled={idx === draft.length - 1}
              aria-label="Опустить ниже в программе"
              title="Опустить ниже в программе"
            >
              <span aria-hidden="true">↓</span>
            </button>
            <button type="button" className="ui-button-link" onClick={() => removeEntry(idx)}>
              Удалить из программы
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
  const { data: course, error: courseLoadError, notFound, refetch } = useCourse(id);
  useObjectCrumb(course?.title, { notFound, failed: Boolean(courseLoadError) });
  const { data: versions, refetch: refetchVersions } = useCourseVersions(id);
  const latestVersionId = versions?.items[versions.items.length - 1]?.id;
  const latestVersion = versions?.items[versions.items.length - 1];
  /*
   * ТЗ 8.4: программа грузится ДЕРЕВОМ целиком. Раньше материалы брались по одному модулю
   * (`useMaterials(selectedModuleId)`), и увидеть программу целиком было негде.
   * `selectedModuleId` остался, но теперь означает не «какие материалы показать», а «в какой
   * модуль сейчас добавляют материал».
   */
  const program = useProgramTree(latestVersionId);
  const [selectedModuleId, setSelectedModuleId] = useState<string>('');
  const {
    publishCourse,
    archiveCourse,
    createCourseVersion,
    saveModule,
    saveMaterial,
    reorderModules,
    reorderMaterials
  } = useDomainMutations();
  /*
   * ТЗ 8.4: состав вкладок приведён к названному в ТЗ (Параметры · Программа · Аттестация ·
   * Документы). Прежние имена `content` и `versions` остаются рабочими в адресе — такие
   * ссылки люди кладут в переписку, и молча сломать их нельзя (`resolveCourseTab`).
   */
  const [rawTab, setTab] = useTabParam([
    ...COURSE_TABS.map((item) => item.id),
    'content',
    'versions'
  ]);
  const tab = resolveCourseTab(rawTab);
  const [moduleTitle, setModuleTitle] = useState('');
  const [materialTitle, setMaterialTitle] = useState('');
  /* Сброс формы одной строкой: так обработка отказа остаётся рядом с вызовом и на виду. */
  /* ТЗ 2.5.a: содержимое текстового материала и адрес внешнего — хранить их стало где. */
  const [materialTextBody, setMaterialTextBody] = useState('');
  const [materialExternalUrl, setMaterialExternalUrl] = useState('');
  const [materialType, setMaterialType] = useState<
    'text' | 'video' | 'file' | 'external_url' | 'scorm'
  >('text');
  const [scormPackageId, setScormPackageId] = useState<string>('');
  const [scormPackages, setScormPackages] = useState<ScormPackageDto[]>([]);
  const [scormPackagesLoaded, setScormPackagesLoaded] = useState(false);
  const [scormPackagesError, setScormPackagesError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  /**
   * Очистка формы материала после успешного добавления — одной строкой в месте вызова.
   *
   * Вынесено не ради красоты: сторож `mutation-failure-is-visible` проверяет, что обработка
   * отказа стоит РЯДОМ с вызовом, а четыре сброса подряд отодвигали её за пределы видимости.
   * Ослаблять сторожа ради длины своего кода — неправильный размен.
   */
  const resetMaterialForm = () => {
    setMaterialTitle('');
    setScormPackageId('');
    setMaterialTextBody('');
    setMaterialExternalUrl('');
  };

  /*
   * Тесты берутся списком и отбираются по курсу здесь: ручка `/tests` отбора по курсу не
   * знает, а заводить его ради одной вкладки — менять контракт ради вида. Страница берётся
   * с запасом; если у центра тестов больше, это видно по подсказке «показаны первые».
   */
  const { data: allTests } = useTests({ page: 1, page_size: 200 });
  const courseTests = allTests?.items ?? [];
  const finalExam = finalExamOf(courseTests, id);
  const moduleTests = moduleTestsOf(courseTests, id);
  const examState = assessmentSummary(finalExam);

  /*
   * Порядок уходит на сервер СПИСКОМ ЦЕЛИКОМ: повтор запроса после обрыва связи тогда ничего
   * не ломает. Отказ обязан быть виден — иначе человек двигает пункт, ничего не происходит,
   * и он двигает снова.
   */
  const moduleIds = program.nodes.map((node) => node.module.id);
  const materialIdsOf = (node: (typeof program.nodes)[number]) =>
    node.materials.map((item) => item.id);

  const moveModule = (moduleId: string, direction: 'up' | 'down') => {
    if (!latestVersionId) return;
    const next = movedByOne(moduleIds, moduleId, direction);
    void reorderModules(latestVersionId, next)
      .then(() => program.refetch())
      .catch((orderError) => setSaveError(readApiMessage(orderError)));
  };

  const moveMaterial = (
    node: (typeof program.nodes)[number],
    materialId: string,
    direction: 'up' | 'down'
  ) => {
    const next = movedByOne(materialIdsOf(node), materialId, direction);
    void reorderMaterials(node.module.id, next)
      .then(() => program.refetch())
      .catch((orderError) => setSaveError(readApiMessage(orderError)));
  };

  const canPublish = hasPermission(session?.permissions ?? [], 'courses.publish');
  const canArchive = hasPermission(session?.permissions ?? [], 'courses.archive');
  /* Новая версия — то же право, что у ручки `course-versions/:courseId` (`courses.write`). */
  const canCreateVersion = hasPermission(session?.permissions ?? [], 'courses.write');

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
    hasModule: program.nodes.length > 0,
    /*
     * Раньше «есть ли материалы» считалось по ОДНОМУ выбранному модулю: курс с полным вторым
     * модулем и пустым первым выглядел неготовым, а пустой курс с открытым непустым модулем —
     * готовым. Теперь по всему дереву (журнал 540).
     */
    hasMaterial: program.nodes.some((node) => node.materials.length > 0)
  });
  const readyToPublish = blockers.length === 0;
  const headerAction = courseHeaderAction({
    status: course?.status ?? 'draft',
    readyToPublish,
    canPublish,
    canCreateVersion
  });

  /*
   * Записи нет — показываем это прямо. Иначе открывалась ПРИЗРАЧНАЯ карточка: заголовок
   * «Курс», пустые разделы и рабочие кнопки действий, которые ничего не делают.
   */
  if (notFound) {
    return <RecordNotFound what="Курс" backHref="/courses" backLabel="К списку курсов" />;
  }

  return (
    <PageContainer>
      <PageHeader
        title={course?.title ?? 'Курс'}
        subtitle="Программа обучения: версии, модули и материалы"
        /*
         * UI-007: одно первичное действие. ТЗ 5.2 (Э2): какое — решает состояние курса
         * (`courseHeaderAction`): черновик — «Опубликовать курс», опубликован — «Создать новую
         * версию», в архиве — ничего. Раньше «Опубликовать курс» висела и у опубликованного.
         */
        {...(headerAction
          ? {
              primaryAction: {
                label: headerAction.label,
                ...(headerAction.kind === 'publish' ? { disabled: headerAction.disabled } : {}),
                onSelect: () =>
                  void (
                    headerAction.kind === 'publish'
                      ? publishCourse(id).then(refetch)
                      : createCourseVersion(id).then(refetchVersions)
                  ).catch((actionError) => setSaveError(readApiMessage(actionError)))
              }
            }
          : {})}
        {...(canArchiveCourse(course?.status ?? 'draft', canArchive)
          ? {
              secondaryActions: [
                {
                  label: 'В архив',
                  onSelect: () =>
                    void archiveCourse(id)
                      .then(refetch)
                      .catch((archiveError) => setSaveError(readApiMessage(archiveError)))
                }
              ]
            }
          : {})}
      />
      <MutationError message={saveError} />

      {/*
        ТЗ 5.7 (Э7): подсказка «что мешает опубликовать» стоит НАД вкладками и видна всегда.
        Она объясняет, почему первичная кнопка выключена; спрятать её во вкладку значило бы
        оставить человека с неработающей кнопкой без объяснения.
      */}
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

      <PageTabs
        tabs={COURSE_TABS}
        activeId={tab}
        onSelect={setTab}
        label="Разделы карточки курса"
      />

      <TabPanel id="params" activeId={tab}>
        {/* МГ-E2.1 (срез 16.3): код, название, направление и поля карточки CDOPROF. */}
        {course ? <CourseBasicsSection course={course} onSaved={() => void refetch()} /> : null}
        {/*
          ТЗ 8.4: «Версии» больше не отдельная вкладка. Версия программы и ЕСТЬ набор
          нормативных параметров на дату — разносить их по разным вкладкам значило бы
          заставлять методиста ходить туда-сюда, чтобы понять, что он правит.
        */}
        <SectionCard title="Версии программы">
          <p className="ui-hint">
            Новая версия нужна, когда программа меняется, а прежние выпуски документов должны
            остаться привязанными к старой редакции.
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
          {/* У опубликованного курса новая версия — главное действие в шапке; второй кнопке не место. */}
          {headerAction?.kind === 'new_version' ? null : (
            <button
              type="button"
              className="ui-button-secondary"
              /*
               * Отказ обязан быть виден: без этого «Добавить версию» на упавшем запросе молчала,
               * и человек нажимал её снова и снова, не понимая, почему список версий пуст.
               */
              onClick={() =>
                void createCourseVersion(id)
                  .then(refetchVersions)
                  .catch((versionError) => setSaveError(readApiMessage(versionError)))
              }
            >
              Добавить версию
            </button>
          )}
        </SectionCard>
        {latestVersion ? (
          <ProgramMetaSection
            courseVersion={latestVersion}
            onUpdated={async () => {
              await refetchVersions();
            }}
            onCreateVersion={() =>
              void createCourseVersion(id)
                .then(refetchVersions)
                .catch((versionError) => setSaveError(readApiMessage(versionError)))
            }
          />
        ) : (
          <SectionEmpty
            message="Параметры появятся вместе с первой версией"
            hint="Нормативные параметры (часы, периодичность, основание) хранятся в версии программы: создайте версию на вкладке «Версии»."
          />
        )}
      </TabPanel>

      <TabPanel id="assessment" activeId={tab}>
        {/*
          ТЗ 8.4: чем обучение заканчивается — часть карточки курса, а не отдельный раздел.
          Раньше методист собирал программу здесь, а проверял наличие экзамена в «Оценивании».
        */}
        <SectionCard title={examState.title}>
          <p className="ui-hint">{examState.hint}</p>
          {finalExam ? (
            <p>
              <Link href={`/admin/tests/${finalExam.id}`}>{finalExam.title}</Link>
            </p>
          ) : (
            <p>
              <Link className="ui-button-secondary" href="/admin/tests">
                Перейти к тестам
              </Link>
            </p>
          )}
        </SectionCard>
        <SectionCard title={`Проверки внутри программы (${moduleTests.length})`}>
          {moduleTests.length === 0 ? (
            <SectionEmpty
              message="Промежуточных проверок нет"
              hint="Тест внутри модуля помогает слушателю закрепить материал по ходу обучения. Итоговый экзамен он не заменяет."
            />
          ) : (
            <ul className="ui-stack">
              {moduleTests.map((test) => (
                <li key={test.id}>
                  <Link href={`/admin/tests/${test.id}`}>{test.title}</Link>
                  {test.publishedAt ? '' : ' — черновик, слушателю не выдаётся'}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </TabPanel>

      <TabPanel id="documents" activeId={tab}>
        {latestVersion ? (
          <DocumentSetSection
            courseVersion={latestVersion}
            onUpdated={async () => {
              await refetchVersions();
            }}
          />
        ) : (
          <SectionEmpty
            message="Пакет документов появится вместе с первой версией"
            hint="Какие документы выйдут слушателю по окончании, задаётся в версии программы: создайте версию на вкладке «Версии»."
          />
        )}
      </TabPanel>

      <TabPanel id="program" activeId={tab}>
        {/*
          ТЗ 8.4: «Посмотреть глазами слушателя». Без этого методист собирает программу
          вслепую — проверить свою работу он мог, только заведя себе учебную запись.
          Действие ВТОРИЧНОЕ: первичное на экране одно, и это «Опубликовать» (`UI-007`).
        */}
        <p className="ui-inline">
          <Link className="ui-button-secondary" href={coursePreviewHref(id)}>
            Посмотреть глазами слушателя
          </Link>
        </p>
        <SectionCard title="Программа">
          {/*
            ТЗ 8.4: дерево «модуль → материалы» вместо двух независимых блоков. Раньше модуль
            приходилось ВЫБИРАТЬ ЗАНОВО в выпадающем списке, а материалы показывались только у
            одного модуля: программу целиком не было видно нигде, и методист держал её в голове.
          */}
          <p className="ui-hint">
            Модуль — раздел программы; внутри него материалы, которые изучает слушатель. Порядок в
            дереве — это порядок обучения.
          </p>

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
                  return program.refetch();
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
              aria-label="Название нового модуля"
            />
            <button type="submit" disabled={!latestVersionId}>
              Добавить модуль
            </button>
          </form>

          {program.error ? <SectionError message={program.error} /> : null}

          {program.nodes.length === 0 ? (
            <SectionEmpty
              message="Модулей пока нет"
              hint="Модуль — раздел программы; внутри него лежат материалы, которые изучает слушатель. Начните с первого модуля."
            />
          ) : (
            <ol className="ui-stack ui-program-tree">
              {program.nodes.map((node, index) => (
                <li key={node.module.id} className="ui-program-tree__module">
                  <div className="ui-inline">
                    <strong>
                      {index + 1}. {node.module.title}
                    </strong>
                    <span className="ui-text-muted">{moduleSummary(node)}</span>
                    {/*
                      Кнопки «вверх»/«вниз» — обязательный запасной способ: перетаскивание мышью
                      на телефоне ненадёжно, а с клавиатуры недоступно вовсе. Порядок уходит на
                      сервер СПИСКОМ ЦЕЛИКОМ, поэтому повтор запроса ничего не ломает.
                    */}
                    {canMove(moduleIds, node.module.id, 'up') ? (
                      <button
                        type="button"
                        className="ui-button-secondary"
                        aria-label={`Поднять модуль «${node.module.title}»`}
                        onClick={() => moveModule(node.module.id, 'up')}
                      >
                        ↑
                      </button>
                    ) : null}
                    {canMove(moduleIds, node.module.id, 'down') ? (
                      <button
                        type="button"
                        className="ui-button-secondary"
                        aria-label={`Опустить модуль «${node.module.title}»`}
                        onClick={() => moveModule(node.module.id, 'down')}
                      >
                        ↓
                      </button>
                    ) : null}
                  </div>

                  {node.materials.length > 0 ? (
                    <ul className="ui-bare-list ui-program-tree__materials">
                      {node.materials.map((item) => (
                        <li key={item.id} className="ui-program-tree__material">
                          <div className="ui-inline">
                            <span>{item.title}</span>
                            <span className="ui-text-muted">
                              {materialTypeLabel(item.materialType)} ·{' '}
                              {viewTimeLabel(item.minViewSeconds)}
                            </span>
                            {/*
                              Кнопка показывается, только когда двигать ЕСТЬ КУДА. Выключенная
                              стрелка у первого пункта — молчащая кнопка: человек жмёт, ничего
                              не происходит, причина неизвестна (ТЗ 5.8). Здесь причина —
                              «дальше некуда», и объяснять её отдельной строкой у каждого пункта
                              значило бы засыпать дерево подписями.
                            */}
                            {canMove(materialIdsOf(node), item.id, 'up') ? (
                              <button
                                type="button"
                                className="ui-button-secondary"
                                aria-label={`Поднять материал «${item.title}»`}
                                onClick={() => moveMaterial(node, item.id, 'up')}
                              >
                                ↑
                              </button>
                            ) : null}
                            {canMove(materialIdsOf(node), item.id, 'down') ? (
                              <button
                                type="button"
                                className="ui-button-secondary"
                                aria-label={`Опустить материал «${item.title}»`}
                                onClick={() => moveMaterial(node, item.id, 'down')}
                              >
                                ↓
                              </button>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {selectedModuleId === node.module.id ? (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (!selectedModuleId || !materialTitle.trim()) return;
                        /*
                         * Содержимое уходит только тому виду материала, которому принадлежит, —
                         * сервер так же его и хранит. Собрано ОТДЕЛЬНОЙ переменной, а не прямо
                         * в вызове: сторож `mutation-failure-is-visible` ищет обработку отказа
                         * рядом с вызовом, и длинный список полей отодвинул бы её.
                         */
                        const content =
                          materialType === 'text'
                            ? { textBody: materialTextBody }
                            : materialType === 'external_url'
                              ? { externalUrl: materialExternalUrl.trim() }
                              : materialType === 'scorm' && scormPackageId
                                ? { scormPackageId }
                                : {};
                        void saveMaterial(null, {
                          moduleId: selectedModuleId,
                          title: materialTitle.trim(),
                          materialType,
                          minViewSeconds: materialType === 'scorm' ? 0 : 60,
                          isRequired: true,
                          ...content
                        })
                          .then(() => {
                            resetMaterialForm();
                            return program.refetch();
                          })
                          .catch((materialError) => setSaveError(readApiMessage(materialError)));
                      }}
                      className="ui-inline"
                    >
                      <input
                        value={materialTitle}
                        onChange={(event) => setMaterialTitle(event.target.value)}
                        placeholder="Название материала"
                        aria-label="Название нового материала"
                      />
                      <select
                        value={materialType}
                        onChange={(event) => {
                          setMaterialType(event.target.value as typeof materialType);
                          setScormPackageId('');
                        }}
                        aria-label="Вид материала"
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
                              aria-label="Учебный пакет"
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
                      {materialType === 'text' ? (
                        /*
                         * Простой редактор из ТЗ 2.5.a — обычное многострочное поле. Разметки нет
                         * намеренно: она потребовала бы очистки от опасного содержимого, а это
                         * отдельная работа вне объёма решения Р8.
                         */
                        <textarea
                          value={materialTextBody}
                          onChange={(event) => setMaterialTextBody(event.target.value)}
                          placeholder="Текст материала: то, что прочитает слушатель"
                          rows={4}
                          aria-label="Текст материала"
                        />
                      ) : null}
                      {materialType === 'external_url' ? (
                        <input
                          value={materialExternalUrl}
                          onChange={(event) => setMaterialExternalUrl(event.target.value)}
                          placeholder="Адрес страницы — скопируйте из адресной строки браузера"
                          aria-label="Адрес внешнего материала"
                        />
                      ) : null}
                      <button
                        type="submit"
                        disabled={
                          (materialType === 'scorm' && !scormPackageId) ||
                          /* Пустой текст или пустая ссылка — это материал, который нечем открыть. */
                          (materialType === 'text' && !materialTextBody.trim()) ||
                          (materialType === 'external_url' && !materialExternalUrl.trim())
                        }
                      >
                        Добавить материал
                      </button>
                      <button
                        type="button"
                        className="ui-button-secondary"
                        onClick={() => setSelectedModuleId('')}
                      >
                        Отмена
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      className="ui-button-secondary"
                      onClick={() => setSelectedModuleId(node.module.id)}
                    >
                      Добавить материал в «{node.module.title}»
                    </button>
                  )}
                </li>
              ))}
            </ol>
          )}

          {program.orphans.length > 0 ? (
            /*
             * Материал, чей модуль пропал: молча не показывать нельзя — методист увидел бы в
             * сумме меньше, чем завёл, и не понял бы почему.
             */
            <SectionError
              message={`Материалов вне модулей: ${program.orphans.length}. Их модуль удалён или принадлежит другой версии программы.`}
            />
          ) : null}
        </SectionCard>
      </TabPanel>
    </PageContainer>
  );
};

// Экраны групп переехали в features/groups/ (Фаза 4 срез 2, SCR-001).
