'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { StatusChip, useConfirmDialog } from '@trudskill/ui';
import { useMemo, useState } from 'react';

import { closeGroupApi, describeProgress } from './api';
import { closeGroupRequest } from './confirm';
import { SectionCard, SectionError } from '../../components/state-wrappers';
import { useAuth } from '../auth/context';
import { CourseSelect } from '../courses/course-picker';
import { GroupSelect } from '../groups/group-picker';
import { useLearnerNames } from '../learners/learner-picker';
import { useDocumentTemplates, useEnrollments, useGroupsList } from '../mvp/hooks';
import { ENROLLMENT_STATUS_LABEL } from '../mvp/screen-helpers';

import type { CloseGroupChainOutcomeDto } from './api';

/**
 * Закрытие группы одной кнопкой (ФТ-A5, Фаза 1 Task 7b).
 *
 * Оператор вводит группу, шаблоны и список сдавших — сервер ставит протокол и
 * удостоверения на рендер. Повторное нажатие безопасно: добивает только упавшие
 * (это же и есть штатный «перезапуск» из ФТ-A5.3). Готовый комплект скачивается
 * одним ZIP — ходить по 25 документам поштучно нереально.
 */
export function CloseGroupSection({ groupId: fixedGroupId }: { groupId?: string } = {}) {
  const { session } = useAuth();
  /* ТЗ 5.3 (Э3): закрытие группы — необратимо; подтверждается вводом названия группы. */
  const { ask, dialog } = useConfirmDialog();
  const { data: groupsPage } = useGroupsList({ page: 1, page_size: 200 });
  const queryClient = useQueryClient();

  /*
   * Фаза 4 срез 3: секцию открывают из карточки группы, где группа уже известна —
   * тогда поле ввода не показывается, чтобы человек не переписывал идентификатор
   * руками из адресной строки. Без пропа поведение прежнее (журнал выдачи).
   */
  const [groupId, setGroupId] = useState(fixedGroupId ?? '');
  const [protocolTemplateId, setProtocolTemplateId] = useState('');
  const [certificateTemplateId, setCertificateTemplateId] = useState('');
  const [selectedEnrollments, setSelectedEnrollments] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // ФТ-E3 (Фаза 5 Task 7): цепочка «экзамен → протокол → документы → реестр».
  const [courseId, setCourseId] = useState('');
  const [chainReport, setChainReport] = useState<CloseGroupChainOutcomeDto | null>(null);
  const trimmedCourse = courseId.trim();
  // Ключ идемпотентности живёт, пока не изменились входные данные: повторный клик
  // с теми же полями возвращает прежний отчёт, а не выпускает вторую выгрузку.
  // Зависимости шире тела memo намеренно: ключ должен смениться при любом
  // изменении входных полей, иначе повтор вернул бы отчёт про другую группу.
  const chainKey = useMemo(
    () => crypto.randomUUID(),
    [groupId, courseId, protocolTemplateId, certificateTemplateId]
  );

  const trimmedGroup = groupId.trim();
  const enrollmentIds = [...selectedEnrollments];

  /*
   * Фаза 6 срез 6 (id-input-ban): вместо «вставьте идентификаторы сдавших» — список
   * зачислений выбранной группы с фамилиями и флажками. Пока группа не выбрана,
   * запрос сжат до одной строки — данные не нужны.
   */
  const groupEnrollments = useEnrollments(
    trimmedGroup ? { group_id: trimmedGroup, page_size: 200 } : { page: 1, page_size: 1 }
  );
  const learnerNames = useLearnerNames();
  const groupRows = trimmedGroup ? (groupEnrollments.data?.items ?? []) : [];

  const templates = useDocumentTemplates();
  const templateOptions = (type: string) =>
    (templates.data?.items ?? []).filter((t) => t.templateType === type);

  const toggleEnrollment = (id: string) =>
    setSelectedEnrollments((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Пока рендер идёт, прогресс обновляется сам — иначе оператор жмёт F5 и
  // гадает, доехала ли группа. Как только всё готово, опрос прекращается.
  const [settled, setSettled] = useState(false);
  const statusQuery = useQuery({
    queryKey: ['group-closure', session?.user.id, trimmedGroup],
    enabled: Boolean(session && trimmedGroup),
    queryFn: async () => {
      const result = await closeGroupApi.status(session!, trimmedGroup);
      setSettled(result.isComplete);
      return result;
    },
    refetchInterval: settled ? undefined : 5000
  });

  const canClose =
    Boolean(trimmedGroup) &&
    Boolean(protocolTemplateId.trim()) &&
    Boolean(certificateTemplateId.trim()) &&
    enrollmentIds.length > 0;

  const run = async (action: () => Promise<string>, failure: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setNotice(await action());
      await queryClient.invalidateQueries({ queryKey: ['group-closure'] });
    } catch (err) {
      setError(err instanceof Error ? err.message : failure);
    } finally {
      setBusy(false);
    }
  };

  const groupName = groupsPage?.items.find((g) => g.id === trimmedGroup)?.name ?? trimmedGroup;
  const confirmClose = () =>
    ask(
      closeGroupRequest({ groupName, learnersCount: enrollmentIds.length, mode: 'close' }),
      () => void closeGroup()
    );
  const confirmChain = () =>
    ask(closeGroupRequest({ groupName, learnersCount: 0, mode: 'chain' }), () => void runChain());

  const closeGroup = () =>
    run(async () => {
      const result = await closeGroupApi.close(session!, {
        groupId: trimmedGroup,
        protocolTemplateId: protocolTemplateId.trim(),
        certificateTemplateId: certificateTemplateId.trim(),
        enrollmentIds
      });
      if (result.created === 0 && result.retried === 0) {
        return 'Всё уже выпущено — новых задач не потребовалось';
      }
      const parts: string[] = [];
      if (result.created > 0) parts.push(`поставлено задач: ${result.created}`);
      if (result.retried > 0) parts.push(`перезапущено упавших: ${result.retried}`);
      return parts.join(', ');
    }, 'Не удалось закрыть группу');

  const downloadPackage = () =>
    run(async () => {
      await closeGroupApi.downloadPackage(session!, trimmedGroup);
      return 'Комплект скачан';
    }, 'Не удалось скачать комплект');

  const canChain =
    Boolean(trimmedGroup) &&
    Boolean(trimmedCourse) &&
    Boolean(protocolTemplateId.trim()) &&
    Boolean(certificateTemplateId.trim());

  const runChain = () =>
    run(async () => {
      const report = await closeGroupApi.closeChain(session!, {
        groupId: trimmedGroup,
        courseId: trimmedCourse,
        protocolTemplateId: protocolTemplateId.trim(),
        certificateTemplateId: certificateTemplateId.trim(),
        idempotencyKey: chainKey
      });
      setChainReport(report);
      if (report.cached) return 'Повтор: показан прежний отчёт, ничего не выпускалось заново';
      if (report.eligible === 0) return 'Довести до документов некого — причины в отчёте ниже';
      return `Дошло до документов: ${report.eligible} чел., отсеяно: ${report.skipped.length}`;
    }, 'Не удалось запустить цепочку');

  const status = statusQuery.data;

  return (
    <SectionCard title="Закрыть группу">
      {dialog}
      <p className="ui-text-muted">
        Одной операцией: протокол на группу и удостоверение каждому сдавшему. Повторное нажатие
        безопасно — добиваются только упавшие, готовые документы не перевыпускаются.
      </p>

      {error ? <SectionError message={error} /> : null}
      {notice ? <p role="status">{notice}</p> : null}

      <div className="ui-stack" style={{ marginTop: 12 }}>
        <div className="ui-inline">
          {fixedGroupId ? null : (
            <GroupSelect value={groupId} onChange={setGroupId} emptyLabel="— выберите группу —" />
          )}
          <label className="ui-field">
            <span className="ui-field-label">Шаблон протокола</span>
            <select
              className="ui-select"
              value={protocolTemplateId}
              onChange={(e) => setProtocolTemplateId(e.target.value)}
            >
              <option value="">— выберите шаблон —</option>
              {templateOptions('protocol').map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="ui-field">
            <span className="ui-field-label">Шаблон удостоверения</span>
            <select
              className="ui-select"
              value={certificateTemplateId}
              onChange={(e) => setCertificateTemplateId(e.target.value)}
            >
              <option value="">— выберите шаблон —</option>
              {templateOptions('certificate').map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {trimmedGroup ? (
          <fieldset className="ui-fieldset">
            <legend>Сдавшие — им выпускаются удостоверения</legend>
            {groupRows.length === 0 ? (
              <p className="ui-hint">
                В группе пока нет зачислений — закрывать некого. Зачислите слушателей в карточке
                группы.
              </p>
            ) : (
              <>
                <div className="ui-inline">
                  <button
                    type="button"
                    className="ui-button"
                    onClick={() => setSelectedEnrollments(new Set(groupRows.map((r) => r.id)))}
                  >
                    Отметить всех
                  </button>
                  <button
                    type="button"
                    className="ui-button"
                    onClick={() => setSelectedEnrollments(new Set())}
                    disabled={selectedEnrollments.size === 0}
                  >
                    Снять отметки
                  </button>
                </div>
                {groupRows.map((row) => (
                  <label key={row.id} className="ui-inline">
                    <input
                      type="checkbox"
                      checked={selectedEnrollments.has(row.id)}
                      onChange={() => toggleEnrollment(row.id)}
                    />
                    <span>{learnerNames.get(row.learnerId) ?? 'Слушатель'}</span>
                    <StatusChip
                      status={row.status}
                      label={ENROLLMENT_STATUS_LABEL[row.status] ?? row.status}
                    />
                  </label>
                ))}
              </>
            )}
          </fieldset>
        ) : null}
        <div className="ui-inline">
          <button
            type="button"
            className="ui-button"
            onClick={() => confirmClose()}
            disabled={busy || !canClose}
          >
            Закрыть группу{enrollmentIds.length ? ` (${enrollmentIds.length} чел.)` : ''}
          </button>
          <button
            type="button"
            className="ui-button"
            onClick={() => void downloadPackage()}
            disabled={busy || !status || status.completed === 0}
          >
            Скачать комплект (ZIP)
          </button>
        </div>
      </div>

      {trimmedGroup ? (
        <p style={{ marginTop: 12 }}>
          Прогресс: <strong>{status ? describeProgress(status) : 'загрузка…'}</strong>
          {status && status.failed > 0 ? (
            <span className="ui-text-muted">
              {' '}
              — нажмите «Закрыть группу» ещё раз, чтобы повторить упавшие
            </span>
          ) : null}
        </p>
      ) : null}

      {/* ФТ-E3 (Фаза 5 Task 7): цепочка. Список сдавших не вводится — сервер сам
          отбирает по результатам экзамена и отчитывается по отсеянным поимённо. */}
      <div className="ui-stack" style={{ marginTop: 20 }}>
        <p className="ui-subheading">Цепочка: экзамен → протокол → документы → реестр</p>
        <p className="ui-text-muted">
          Одна операция по группе: сервер сам отбирает сдавших, ставит протокол и удостоверения,
          затем собирает строки выгрузки в реестр. Отсеянные — поимённо с причиной; повторный запуск
          с теми же полями ничего не дублирует.
        </p>
        <div className="ui-inline">
          <CourseSelect
            value={courseId}
            onChange={setCourseId}
            label="Курс (для проверки готовности)"
          />
          {/*
            Э4 (ТЗ 5.4): акцент снят. Подпись нейтральная, но действие то же необратимое
            закрытие группы: сервер отбирает сдавших, выпускает документы с номерами и готовит
            строки госвыгрузки. Оранжевая кнопка вела глаз к самой тяжёлой операции панели,
            а соседняя, более узкая «Закрыть группу», выглядела скромнее.
          */}
          <button
            type="button"
            className="ui-button"
            onClick={() => confirmChain()}
            disabled={busy || !canChain}
          >
            Запустить цепочку
          </button>
        </div>

        {chainReport ? (
          <div className="ui-stack" data-testid="chain-report">
            <p>
              Дошло до документов: <strong>{chainReport.eligible}</strong>
              {chainReport.cached ? ' (повтор — отчёт из кэша)' : ''}
            </p>
            {chainReport.documents ? (
              <p className="ui-text-muted">
                Документы: задач поставлено {chainReport.documents.created}, перезапущено упавших{' '}
                {chainReport.documents.retried}, удостоверений {chainReport.documents.certificates}
              </p>
            ) : null}
            {chainReport.registry ? (
              <p className="ui-text-muted">
                Реестр: строк {chainReport.registry.total}, готово {chainReport.registry.exported},
                с ошибками {chainReport.registry.failed}
              </p>
            ) : null}
            {chainReport.skipped.length > 0 ? (
              <div>
                <p className="ui-subheading">Отсеяны ({chainReport.skipped.length})</p>
                <ul className="ui-bare-list">
                  {chainReport.skipped.map((s) => (
                    <li key={s.enrollmentId}>
                      {s.fullName || s.enrollmentId} — {s.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {chainReport.registry && chainReport.registry.errors.length > 0 ? (
              <div>
                <p className="ui-subheading">
                  Ошибки строк реестра ({chainReport.registry.errors.length})
                </p>
                <ul className="ui-bare-list">
                  {chainReport.registry.errors.map((e, i) => (
                    <li key={`${e.enrollmentId}-${e.field}-${i}`}>
                      {e.fullName || e.enrollmentId}: {e.field} — {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}
