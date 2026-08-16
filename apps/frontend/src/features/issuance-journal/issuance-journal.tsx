'use client';

import { DetailDrawer, FilterBar, ListPage, StatusChip } from '@trudskill/ui';
import { type ReactElement, useState } from 'react';

import { issuanceJournalApi } from './api';
import { useIssuanceJournal } from './hooks';
import { type RevokeReissueAction, RevokeReissueModal } from './revoke-reissue-modal';
import {
  ALL_TEMPLATE_TYPES,
  DOCUMENT_STATUS_LABELS,
  FILTERABLE_DOCUMENT_STATUSES,
  type IssuanceJournalFilter,
  type IssuedDocument,
  TEMPLATE_TYPE_LABELS,
  type TemplateType
} from './types';
import { PageContainer, PageHeader, SectionCard } from '../../components/state-wrappers';
import { useAuth } from '../auth/context';
import { CloseGroupSection } from '../close-group/screens';
import { formatDate } from '../mvp/screen-helpers';

const PAGE_SIZE = 50;

interface JournalRow {
  id: string;
  documentDateView: string;
  documentNumberView: string;
  documentTypeView: string;
  statusView: ReactElement;
  status: string;
  documentNumber: string | undefined;
}

interface ModalState {
  action: RevokeReissueAction;
  documentId: string;
  documentNumber: string | undefined;
}

/*
 * TPL-001 (Фаза 4, срез 6). Что изменилось:
 *
 * 1. Каркас реестра `ListPage` вместо самодельных карточек, пагинации и состояний.
 * 2. Фильтров видно три (бюджет ТЗ §13.2), выбор типов документов — восемь галочек —
 *    уехал под «Ещё фильтры» со счётчиком заданных (`CMP-003`).
 * 3. **В фильтре статуса были коды** `generated` / `final` / `archived`. Администратор
 *    учебного центра не обязан знать, что «final» — это «выдан».
 * 4. Действия строки — через `rowActions` таблицы, а не двумя кнопками внутри данных.
 * 5. Форма закрытия группы больше не висит развёрнутой под реестром: она открывается
 *    панелью по кнопке. Путь не убран — закрытие по-прежнему доступно отсюда, но экран
 *    читается как реестр, а не как реестр плюс чужая форма.
 */
export function IssuanceJournalView() {
  const { session } = useAuth();
  const [filter, setFilter] = useState<IssuanceJournalFilter>({ limit: PAGE_SIZE, offset: 0 });
  const { data, isLoading, error } = useIssuanceJournal(filter);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [closeGroupOpen, setCloseGroupOpen] = useState(false);

  // exactOptionalPropertyTypes: explicit undefined запрещён в Partial<T>.
  // Patcher принимает только nullable, и сам решает удалить или установить ключ.
  const updateFilter = (patch: {
    from?: string | null;
    to?: string | null;
    types?: TemplateType[] | null;
    status?: string | null;
  }) => {
    setFilter((prev) => {
      const next: IssuanceJournalFilter = { limit: PAGE_SIZE, offset: 0 };
      const merged = { ...prev, offset: 0 } as IssuanceJournalFilter;
      if (patch.from !== undefined) {
        if (patch.from) merged.from = patch.from;
        else delete merged.from;
      }
      if (patch.to !== undefined) {
        if (patch.to) merged.to = patch.to;
        else delete merged.to;
      }
      if (patch.status !== undefined) {
        if (patch.status) merged.status = patch.status;
        else delete merged.status;
      }
      if (patch.types !== undefined) {
        if (patch.types && patch.types.length > 0) merged.types = patch.types;
        else delete merged.types;
      }
      return { ...next, ...merged };
    });
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const currentPage = Math.floor((filter.offset ?? 0) / PAGE_SIZE) + 1;
  const filtersApplied = [filter.from, filter.to, filter.status, filter.types].filter(
    Boolean
  ).length;

  const rows: JournalRow[] = (data?.items ?? []).map((doc: IssuedDocument) => ({
    id: doc.id,
    documentDateView: formatDate(doc.documentDate),
    documentNumberView: doc.documentNumber ?? 'без номера',
    documentTypeView: TEMPLATE_TYPE_LABELS[doc.documentType] ?? doc.documentType,
    statusView: (
      <StatusChip status={doc.status} label={DOCUMENT_STATUS_LABELS[doc.status] ?? doc.status} />
    ),
    status: doc.status,
    documentNumber: doc.documentNumber
  }));

  return (
    <PageContainer>
      <PageHeader
        title="Книга выдачи документов"
        subtitle="Все выпущенные удостоверения, протоколы и приказы — с выгрузкой для проверяющих"
        actions={
          <button
            type="button"
            className="ui-button-secondary"
            onClick={() => {
              if (session) void issuanceJournalApi.downloadCsv(session, filter);
            }}
            disabled={!session || (data?.total ?? 0) === 0}
          >
            Скачать таблицей
          </button>
        }
      />

      <FilterBar
        activeCount={filter.types ? 1 : 0}
        onReset={() => setFilter({ limit: PAGE_SIZE, offset: 0 })}
        primary={
          <>
            <label className="ui-field">
              <span className="ui-field-label">Выдано с</span>
              <input
                type="date"
                value={filter.from ?? ''}
                onChange={(e) => updateFilter({ from: e.target.value || null })}
              />
            </label>
            <label className="ui-field">
              <span className="ui-field-label">по</span>
              <input
                type="date"
                value={filter.to ?? ''}
                onChange={(e) => updateFilter({ to: e.target.value || null })}
              />
            </label>
            <label className="ui-field">
              <span className="ui-field-label">Статус</span>
              <select
                value={filter.status ?? ''}
                onChange={(e) => updateFilter({ status: e.target.value || null })}
              >
                <option value="">Любое</option>
                {FILTERABLE_DOCUMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {DOCUMENT_STATUS_LABELS[s] ?? s}
                  </option>
                ))}
              </select>
            </label>
          </>
        }
        secondary={
          <fieldset className="ui-fieldset">
            <legend>Виды документов</legend>
            <div className="ui-inline">
              {ALL_TEMPLATE_TYPES.map((t) => {
                const selectedTypes = filter.types ?? ALL_TEMPLATE_TYPES;
                return (
                  <label key={t} className="ui-inline">
                    <input
                      type="checkbox"
                      checked={selectedTypes.includes(t)}
                      onChange={(e) => {
                        const prev = filter.types ?? ALL_TEMPLATE_TYPES;
                        const next: TemplateType[] = e.target.checked
                          ? Array.from(new Set([...prev, t]))
                          : prev.filter((x) => x !== t);
                        // Выбраны все восемь — это «без фильтра», а не фильтр из восьми.
                        updateFilter({
                          types: next.length === ALL_TEMPLATE_TYPES.length ? null : next
                        });
                      }}
                    />
                    <span>{TEMPLATE_TYPE_LABELS[t]}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        }
      />

      <ListPage<JournalRow>
        columns={[
          { key: 'documentDateView', title: 'Дата выдачи' },
          { key: 'documentNumberView', title: 'Номер' },
          { key: 'documentTypeView', title: 'Вид документа' },
          { key: 'statusView', title: 'Статус', render: (row) => row.statusView }
        ]}
        rows={rows}
        isLoading={isLoading}
        error={error}
        rowKey={(row) => row.id}
        rowActions={(row) =>
          row.status === 'revoked'
            ? []
            : [
                {
                  label: 'Аннулировать',
                  danger: true,
                  onSelect: () =>
                    setModal({
                      action: 'revoke',
                      documentId: row.id,
                      documentNumber: row.documentNumber
                    })
                },
                {
                  label: 'Перевыпустить',
                  onSelect: () =>
                    setModal({
                      action: 'reissue',
                      documentId: row.id,
                      documentNumber: row.documentNumber
                    })
                }
              ]
        }
        emptyMessage={
          filtersApplied > 0
            ? 'По этому отбору документов нет'
            : 'Здесь появятся выданные документы'
        }
        emptyHint={
          filtersApplied > 0
            ? 'Попробуйте расширить период или снять отбор по виду документа.'
            : 'Удостоверения и протоколы попадают сюда сами — когда группа закрыта и документы выпущены.'
        }
        {...(filtersApplied > 0
          ? {
              emptyAction: {
                label: 'Показать все документы',
                onSelect: () => setFilter({ limit: PAGE_SIZE, offset: 0 })
              }
            }
          : {})}
        page={currentPage}
        totalPages={totalPages}
        onPageChange={(next) => setFilter((f) => ({ ...f, offset: (next - 1) * PAGE_SIZE }))}
      />

      <SectionCard title="Закрытие учебной группы">
        <p className="ui-hint">
          Закрыть группу и выпустить документы можно прямо в её карточке — или здесь, если под рукой
          номер группы.
        </p>
        <button type="button" className="ui-button" onClick={() => setCloseGroupOpen(true)}>
          Открыть закрытие группы
        </button>
      </SectionCard>

      {closeGroupOpen ? (
        <DetailDrawer
          open={true}
          title="Закрытие учебной группы"
          width="lg"
          onClose={() => setCloseGroupOpen(false)}
        >
          <CloseGroupSection />
        </DetailDrawer>
      ) : null}

      {modal ? (
        <RevokeReissueModal
          open={true}
          action={modal.action}
          documentId={modal.documentId}
          {...(modal.documentNumber !== undefined ? { documentNumber: modal.documentNumber } : {})}
          onClose={() => setModal(null)}
        />
      ) : null}
    </PageContainer>
  );
}
