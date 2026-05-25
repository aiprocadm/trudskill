'use client';

import { DataTable, LoadingState, StatusChip } from '@cdoprof/ui';
import { type ReactElement, useState } from 'react';

import { issuanceJournalApi } from './api';
import { useIssuanceJournal } from './hooks';
import { type RevokeReissueAction, RevokeReissueModal } from './revoke-reissue-modal';
import {
  ALL_TEMPLATE_TYPES,
  type IssuanceJournalFilter,
  type IssuedDocument,
  TEMPLATE_TYPE_LABELS,
  type TemplateType
} from './types';
import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../components/state-wrappers';
import { useAuth } from '../auth/context';

const PAGE_SIZE = 50;
const STATUS_OPTIONS = ['generated', 'final', 'archived'];

interface JournalRow extends IssuedDocument {
  no: string;
  documentDateView: string;
  documentNumberView: string;
  documentTypeView: string;
  statusView: ReactElement;
  actionsView: ReactElement;
}

interface ModalState {
  action: RevokeReissueAction;
  documentId: string;
  documentNumber: string | undefined;
}

export function IssuanceJournalView() {
  const { session } = useAuth();
  const [filter, setFilter] = useState<IssuanceJournalFilter>({ limit: PAGE_SIZE, offset: 0 });
  const { data, isLoading, error } = useIssuanceJournal(filter);
  const [modal, setModal] = useState<ModalState | null>(null);

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

  return (
    <PageContainer>
      <PageHeader
        title="Книга выдачи документов"
        subtitle="Реестр всех выпущенных удостоверений, протоколов и приказов с фильтрами и CSV-экспортом для регулятора"
        actions={
          <button
            type="button"
            className="ui-button"
            onClick={() => {
              if (session) void issuanceJournalApi.downloadCsv(session, filter);
            }}
            disabled={!session || (data?.total ?? 0) === 0}
          >
            Скачать CSV
          </button>
        }
      />

      <SectionCard title="Фильтры">
        <div className="ui-stack" style={{ gap: 12 }}>
          <div className="ui-inline" style={{ gap: 12, flexWrap: 'wrap' }}>
            <label className="ui-stack" style={{ gap: 4 }}>
              <span>С</span>
              <input
                type="date"
                value={filter.from ?? ''}
                onChange={(e) => updateFilter({ from: e.target.value || null })}
              />
            </label>
            <label className="ui-stack" style={{ gap: 4 }}>
              <span>По</span>
              <input
                type="date"
                value={filter.to ?? ''}
                onChange={(e) => updateFilter({ to: e.target.value || null })}
              />
            </label>
            <label className="ui-stack" style={{ gap: 4 }}>
              <span>Статус</span>
              <select
                value={filter.status ?? ''}
                onChange={(e) => updateFilter({ status: e.target.value || null })}
              >
                <option value="">Все</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <fieldset>
            <legend>Типы документов</legend>
            <div className="ui-inline" style={{ flexWrap: 'wrap', gap: 12 }}>
              {ALL_TEMPLATE_TYPES.map((t) => {
                const selectedTypes = filter.types ?? ALL_TEMPLATE_TYPES;
                const checked = selectedTypes.includes(t);
                return (
                  <label key={t} className="ui-inline" style={{ gap: 4 }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const prev = filter.types ?? ALL_TEMPLATE_TYPES;
                        const next: TemplateType[] = e.target.checked
                          ? Array.from(new Set([...prev, t]))
                          : prev.filter((x) => x !== t);
                        // Если выбраны все 8 — отправляем null (без фильтра типов).
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
        </div>
      </SectionCard>

      <SectionCard title="Документы">
        {isLoading ? <LoadingState message="Загрузка книги выдачи…" /> : null}
        {error ? <SectionError message="Не удалось загрузить книгу выдачи" /> : null}
        {!isLoading && !error && (data?.items.length ?? 0) === 0 ? (
          <SectionEmpty message="Нет выданных документов" hint="Попробуйте изменить фильтры" />
        ) : null}
        {!isLoading && data && data.items.length > 0 ? (
          <DataTable<JournalRow>
            columns={[
              { key: 'no', title: '№' },
              { key: 'documentDateView', title: 'Дата' },
              { key: 'documentNumberView', title: '№ документа' },
              { key: 'documentTypeView', title: 'Тип' },
              { key: 'statusView', title: 'Статус', render: (row) => row.statusView },
              { key: 'actionsView', title: 'Действия', render: (row) => row.actionsView }
            ]}
            rows={data.items.map(
              (doc, idx): JournalRow => ({
                ...doc,
                no: String(idx + 1 + (filter.offset ?? 0)),
                documentDateView: doc.documentDate ?? '—',
                documentNumberView: doc.documentNumber ?? '—',
                documentTypeView: TEMPLATE_TYPE_LABELS[doc.documentType] ?? doc.documentType,
                statusView: <StatusChip status={doc.status} />,
                actionsView:
                  doc.status === 'revoked' ? (
                    <span style={{ color: '#888' }}>—</span>
                  ) : (
                    <span className="ui-inline" style={{ gap: 6 }}>
                      <button
                        type="button"
                        className="ui-button"
                        onClick={() =>
                          setModal({
                            action: 'revoke',
                            documentId: doc.id,
                            documentNumber: doc.documentNumber
                          })
                        }
                      >
                        Аннулировать
                      </button>
                      <button
                        type="button"
                        className="ui-button"
                        onClick={() =>
                          setModal({
                            action: 'reissue',
                            documentId: doc.id,
                            documentNumber: doc.documentNumber
                          })
                        }
                      >
                        Перевыпустить
                      </button>
                    </span>
                  )
              })
            )}
          />
        ) : null}
        {modal ? (
          <RevokeReissueModal
            open={true}
            action={modal.action}
            documentId={modal.documentId}
            {...(modal.documentNumber !== undefined
              ? { documentNumber: modal.documentNumber }
              : {})}
            onClose={() => setModal(null)}
          />
        ) : null}
        {data && data.total > PAGE_SIZE ? (
          <div className="ui-inline" style={{ gap: 8, marginTop: 12 }}>
            <span>
              Страница {currentPage} из {totalPages} ({data.total} всего)
            </span>
            <button
              type="button"
              className="ui-button"
              disabled={(filter.offset ?? 0) === 0}
              onClick={() =>
                setFilter((f) => ({
                  ...f,
                  offset: Math.max(0, (f.offset ?? 0) - PAGE_SIZE)
                }))
              }
            >
              ← Назад
            </button>
            <button
              type="button"
              className="ui-button"
              disabled={(filter.offset ?? 0) + PAGE_SIZE >= data.total}
              onClick={() => setFilter((f) => ({ ...f, offset: (f.offset ?? 0) + PAGE_SIZE }))}
            >
              Вперёд →
            </button>
          </div>
        ) : null}
      </SectionCard>
    </PageContainer>
  );
}
