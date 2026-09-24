'use client';

import {
  DataTable,
  DetailLayout,
  KeyValueList,
  LoadingState,
  PageTabs,
  StatusChip,
  TabPanel
} from '@trudskill/ui';
import Link from 'next/link';
import { useState } from 'react';

import { fetchLearnerDossierPdfUrl } from './api';
import { useLearnerHistory } from './hooks';
import { LearnerEditDrawer } from './learner-edit-drawer';
import { LearnerFilesSection } from './learner-files-section';
import { LearnerProfileSection } from './learner-profile-section';
import {
  PageContainer,
  PageHeader,
  RecordNotFound,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../components/state-wrappers';
import { hasPermission } from '../../lib/rbac/permissions';
import { describeAction, entityLabel } from '../audit/labels';
import { useAuth } from '../auth/context';
import { useLearnerPdfCard } from '../learner-pdf-card/hooks';
import { useLearner } from '../mvp/hooks';
import {
  DOCUMENT_TYPE_LABELS,
  ENROLLMENT_RESULT_LABEL,
  ENROLLMENT_STATUS_LABEL,
  formatDate,
  formatDateTime
} from '../mvp/screen-helpers';
import { useObjectCrumb } from '../navigation/use-object-crumb';
import { useTabParam } from '../navigation/use-tab-param';

import type { LearnerProfile } from './types';

/*
 * TPL-002 — эталон карточки (ТЗ §8.2); с МГ-C2.1 (срез 9.1) — с вкладками одного уровня:
 * Личное дело · Обучение · Документы · История. Справа — сводка `KeyValueList`.
 *
 * Что изменилось против ленты без вкладок:
 * 1. «Учебная история» и «Обучение» были двумя таблицами об одном и том же — осталась одна.
 * 2. Блок «Личные данные (для PDF)» печатал полный СНИЛС под `learners.read` (журнал 638) и
 *    мёртвую кнопку «Экспорт PDF» — убран; СНИЛС раскрывается по причине в «Личном деле».
 * 3. Дело слушателя одним PDF (ФТ-C2) существовало только как ручка (журнал 641) — теперь в
 *    меню «Ещё» вместе с обезличиванием; «Выслать доступ» — срез 9.3, лист доступов — МГ-C4.
 * 4. Названия курса и группы приходят в агрегате карточки: три запроса справочников по 100
 *    строк с карточки ушли (РМ92).
 */
const LEARNER_CARD_TABS = [
  { id: 'personal', label: 'Личное дело' },
  { id: 'learning', label: 'Обучение' },
  { id: 'documents', label: 'Документы' },
  /* МГ-C2.1 (срез 9.2): согласия и сканы — до N файлов, предел центра. */
  { id: 'files', label: 'Файлы' },
  { id: 'history', label: 'История' }
];
const TAB_IDS = LEARNER_CARD_TABS.map((tab) => tab.id);

export const LearnerDetailsScreen = ({ id }: { id: string }) => {
  const { data: learner, loading, error, notFound, refetch } = useLearner(id);
  const { session } = useAuth();
  const permissions = session?.permissions ?? [];
  /* МГ-C1.1 (срез 8.12b): правка личного дела — той же панелью, что и в реестре (один путь). */
  const canEdit = hasPermission(permissions, 'learners.write');
  const canManagePii = hasPermission(permissions, 'learners.pii.manage');
  const [drawer, setDrawer] = useState<'personal' | 'erase' | null>(null);
  const [tab, setTab] = useTabParam(TAB_IDS, 'personal');
  const card = useLearnerPdfCard(id);
  const history = useLearnerHistory(id, tab === 'history');
  const [actionError, setActionError] = useState<unknown>(null);
  const [dossierBusy, setDossierBusy] = useState(false);

  const fullName = learner ? `${learner.lastName} ${learner.firstName}`.trim() : '';
  useObjectCrumb(fullName || undefined, { notFound, failed: Boolean(error) });

  /*
   * Записи нет — говорим это прямо. Прежде открывалась карточка-призрак: заголовок на месте,
   * разделы пустые, кнопки действий рабочие, а под ними строка ошибки, которую человек
   * принимает за временный сбой.
   */
  if (notFound) {
    return <RecordNotFound what="Слушатель" backHref="/learners" backLabel="К списку слушателей" />;
  }

  /* Дело слушателя (ФТ-C2): сервер отдаёт файл, а не конверт API — открываем во вкладке. */
  const openDossier = () => {
    if (!session) return;
    setDossierBusy(true);
    setActionError(null);
    fetchLearnerDossierPdfUrl(session, id)
      .then((url) => {
        window.open(url, '_blank', 'noopener');
      })
      .catch((err: unknown) => setActionError(err))
      .finally(() => setDossierBusy(false));
  };

  /*
   * Меню «Ещё» (ТЗ: «…»): дело PDF и обезличивание — только с правом на ПДн (РМ90).
   * Два действия и больше компонент сам складывает в меню; опасное — в его низ.
   */
  const secondaryActions = canManagePii
    ? [
        { label: 'Скачать личное дело (PDF)', onSelect: openDossier, busy: dossierBusy },
        { label: 'Обезличить данные', danger: true, onSelect: () => setDrawer('erase') }
      ]
    : [];

  const enrollments = card.data?.enrollments ?? [];
  const documents = card.data?.documents ?? [];

  return (
    <PageContainer>
      <PageHeader
        title={fullName || 'Слушатель'}
        subtitle="Личное дело: кто это, где учится, что уже получил"
        {...(canEdit && learner
          ? {
              primaryAction: {
                label: 'Редактировать личное дело',
                onSelect: () => setDrawer('personal')
              }
            }
          : {})}
        {...(secondaryActions.length > 0 && learner ? { secondaryActions } : {})}
      />
      {drawer && learner ? (
        <LearnerEditDrawer
          learner={learner as unknown as LearnerProfile}
          initialTab={drawer}
          onClose={() => setDrawer(null)}
          onSaved={() => {
            setDrawer(null);
            void refetch();
            void card.refetch();
          }}
        />
      ) : null}
      {loading ? <LoadingState message="Загружаем карточку…" /> : null}
      {error ? <SectionError message={error} onRetry={() => void refetch()} /> : null}
      {actionError !== null ? <SectionError error={actionError} /> : null}
      {learner ? (
        <DetailLayout
          aside={
            <SectionCard title="Коротко">
              <KeyValueList
                items={[
                  { label: 'Статус', value: <StatusChip status={learner.status} /> },
                  { label: 'Личный номер', value: learner.learnerNo ?? 'не присвоен' },
                  { label: 'Почта', value: learner.email ?? 'не указана' },
                  {
                    /*
                     * Раньше здесь печатался идентификатор учётной записи. Администратору
                     * важно другое: сможет ли человек войти в кабинет.
                     */
                    label: 'Вход в кабинет',
                    value: learner.linkedIamUserId ? 'открыт' : 'не открыт'
                  },
                  { label: 'Заведён', value: formatDate(learner.createdAt) }
                ]}
              />
            </SectionCard>
          }
        >
          <PageTabs
            tabs={LEARNER_CARD_TABS}
            activeId={tab}
            onSelect={setTab}
            label="Разделы карточки слушателя"
          />

          <TabPanel id="personal" activeId={tab}>
            <LearnerProfileSection learner={learner as unknown as LearnerProfile} />
          </TabPanel>

          <TabPanel id="learning" activeId={tab}>
            <SectionCard title="Обучение">
              {card.isLoading ? <LoadingState message="Загружаем зачисления…" /> : null}
              {card.error ? (
                <SectionError error={card.error} onRetry={() => void card.refetch()} />
              ) : null}
              {card.data && enrollments.length === 0 ? (
                <SectionEmpty
                  message="Слушатель пока никуда не зачислен"
                  hint="Зачисление делается в карточке учебной группы — там же виден весь её состав."
                />
              ) : null}
              {enrollments.length > 0 ? (
                <DataTable
                  columns={[
                    { key: 'course', title: 'Программа' },
                    { key: 'group', title: 'Группа' },
                    { key: 'enrolledAt', title: 'Зачислен' },
                    { key: 'completedAt', title: 'Завершил' },
                    { key: 'status', title: 'Статус' },
                    { key: 'result', title: 'Итог' },
                    { key: 'documents', title: 'Документы' }
                  ]}
                  rows={enrollments.map((item) => ({
                    course: item.courseTitle || '—',
                    group: item.groupId ? (
                      <Link className="ui-link" href={`/groups/${item.groupId}`}>
                        {item.groupName || 'группа'}
                      </Link>
                    ) : (
                      '—'
                    ),
                    enrolledAt: formatDate(item.enrolledAt),
                    completedAt: item.completedAt ? formatDate(item.completedAt) : '—',
                    status: ENROLLMENT_STATUS_LABEL[item.status] ?? item.status,
                    result: item.resultCode
                      ? (ENROLLMENT_RESULT_LABEL[item.resultCode] ?? item.resultCode)
                      : '—',
                    documents: item.documentsCount ? String(item.documentsCount) : 'нет'
                  }))}
                />
              ) : null}
            </SectionCard>
          </TabPanel>

          <TabPanel id="documents" activeId={tab}>
            <SectionCard title="Выданные документы">
              {card.isLoading ? <LoadingState message="Загружаем документы…" /> : null}
              {card.error ? (
                <SectionError error={card.error} onRetry={() => void card.refetch()} />
              ) : null}
              {card.data && documents.length === 0 ? (
                <SectionEmpty
                  message="Документы не выданы"
                  hint="Удостоверения и протоколы появляются после закрытия группы — тогда же их увидит и слушатель в своём кабинете."
                />
              ) : null}
              {documents.length > 0 ? (
                <DataTable
                  columns={[
                    { key: 'documentNumber', title: '№ документа' },
                    { key: 'documentDate', title: 'Дата' },
                    { key: 'documentType', title: 'Тип' },
                    { key: 'status', title: 'Статус' }
                  ]}
                  rows={documents.map((doc) => ({
                    documentNumber: doc.documentNumber ?? '—',
                    documentDate: formatDate(doc.documentDate),
                    documentType: DOCUMENT_TYPE_LABELS[doc.documentType] ?? doc.documentType,
                    status: <StatusChip status={doc.status} />
                  }))}
                />
              ) : null}
            </SectionCard>
          </TabPanel>

          <TabPanel id="files" activeId={tab}>
            <LearnerFilesSection learnerId={id} />
          </TabPanel>

          <TabPanel id="history" activeId={tab}>
            <SectionCard title="История">
              {history.isLoading ? <LoadingState message="Загружаем историю…" /> : null}
              {history.error ? (
                <SectionError error={history.error} onRetry={() => void history.refetch()} />
              ) : null}
              {history.data && history.data.items.length === 0 ? (
                <SectionEmpty
                  message="Событий пока нет"
                  hint="Здесь появятся заведение, правки карточки, зачисления и раскрытия данных — с датой и именем сотрудника."
                />
              ) : null}
              {history.data && history.data.items.length > 0 ? (
                <DataTable
                  columns={[
                    { key: 'when', title: 'Когда' },
                    { key: 'who', title: 'Кто' },
                    { key: 'what', title: 'Что произошло' },
                    { key: 'over', title: 'Над чем' }
                  ]}
                  rows={history.data.items.map((item) => ({
                    id: item.id,
                    when: formatDateTime(item.createdAt),
                    who: item.system ? 'Система' : (item.actorName ?? 'Удалённая учётная запись'),
                    what: describeAction(item.action),
                    over: entityLabel(item.entityType)
                  }))}
                />
              ) : null}
              {history.data?.truncated ? (
                <p className="ui-hint">
                  Показаны последние события; полный журнал — в разделе «Журнал действий».
                </p>
              ) : null}
            </SectionCard>
          </TabPanel>
        </DetailLayout>
      ) : null}
    </PageContainer>
  );
};
