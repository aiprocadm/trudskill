'use client';

import { DataTable, LoadingState } from '@cdoprof/ui';
import { type ReactElement, useMemo, useState } from 'react';

import { useReportBuilderMutations, useReportEntities, useReportTemplates } from './hooks';
import { canRun, setFilter, toRequest, toggleField, triggerDownload } from './report-builder';
import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../components/state-wrappers';

import type { BuilderState, ReportEntityKey, ReportPreview, ReportTemplate } from './types';

const EMPTY_STATE: BuilderState = { entityKey: '', selectedFields: [], filters: [] };

type PreviewRow = Record<string, string | number | null> & { id: string };

function formatCell(value: string | number | null): string {
  return value === null || value === undefined || value === '' ? '—' : String(value);
}

export function ReportBuilderScreen(): ReactElement {
  const { data: meta, isLoading: metaLoading, error: metaError } = useReportEntities();
  const { data: templates } = useReportTemplates();
  const {
    previewPending,
    exportPending,
    savePending,
    preview,
    exportReport,
    saveTemplate,
    deleteTemplate
  } = useReportBuilderMutations();

  const [state, setState] = useState<BuilderState>(EMPTY_STATE);
  const [previewData, setPreviewData] = useState<ReportPreview | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const currentEntity = useMemo(
    () => meta?.entities.find((e) => e.key === state.entityKey) ?? null,
    [meta, state.entityKey]
  );

  const resetNotices = () => {
    setNotice(null);
    setActionError(null);
  };

  const onSelectEntity = (key: ReportEntityKey | '') => {
    setState({ entityKey: key, selectedFields: [], filters: [] });
    setPreviewData(null);
    resetNotices();
  };

  const onPreview = async () => {
    resetNotices();
    try {
      setPreviewData(await preview(toRequest(state)));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Не удалось построить превью');
    }
  };

  const onExport = async () => {
    resetNotices();
    try {
      const out = await exportReport(toRequest(state));
      triggerDownload(out.contentBase64, out.mimeType, out.fileName);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Не удалось скачать отчёт');
    }
  };

  const onSave = async () => {
    resetNotices();
    if (state.entityKey === '' || templateName.trim() === '') {
      setActionError('Укажите название шаблона и выберите сущность');
      return;
    }
    try {
      await saveTemplate({ ...toRequest(state), name: templateName.trim() });
      setNotice(`Шаблон «${templateName.trim()}» сохранён`);
      setTemplateName('');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Не удалось сохранить шаблон');
    }
  };

  const onLoadTemplate = (tpl: ReportTemplate) => {
    setState({
      entityKey: tpl.entityKey,
      selectedFields: tpl.selectedFields,
      filters: tpl.filters
    });
    setPreviewData(null);
    resetNotices();
  };

  const onDeleteTemplate = async (id: string) => {
    if (!window.confirm('Удалить шаблон?')) return;
    resetNotices();
    try {
      await deleteTemplate(id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Не удалось удалить шаблон');
    }
  };

  const previewRows: PreviewRow[] = (previewData?.rows ?? []).map((row, idx) => ({
    id: String(idx),
    ...row
  }));

  return (
    <PageContainer>
      <PageHeader
        title="Конструктор отчётов"
        subtitle="Выберите сущность, поля и фильтры — получите превью и выгрузку в Excel."
      />

      {metaLoading ? <LoadingState message="Загрузка конструктора…" /> : null}
      {metaError ? <SectionError message="Не удалось загрузить конструктор отчётов" /> : null}

      {meta ? (
        <>
          <SectionCard title="Параметры отчёта">
            <label className="ui-inline" style={{ gap: 4, marginBottom: 12 }}>
              <span>Сущность:</span>
              <select
                value={state.entityKey}
                onChange={(e) => onSelectEntity(e.target.value as ReportEntityKey | '')}
              >
                <option value="">— выберите —</option>
                {meta.entities.map((ent) => (
                  <option key={ent.key} value={ent.key}>
                    {ent.label}
                  </option>
                ))}
              </select>
            </label>

            {currentEntity ? (
              <>
                <fieldset style={{ marginBottom: 12 }}>
                  <legend>Поля</legend>
                  {currentEntity.fields.map((f) => (
                    <label key={f.key} className="ui-inline" style={{ gap: 4, marginRight: 12 }}>
                      <input
                        type="checkbox"
                        checked={state.selectedFields.includes(f.key)}
                        onChange={() =>
                          setState((s) => ({
                            ...s,
                            selectedFields: toggleField(s.selectedFields, f.key)
                          }))
                        }
                      />
                      <span>{f.header}</span>
                    </label>
                  ))}
                </fieldset>

                {currentEntity.filters.length > 0 ? (
                  <fieldset style={{ marginBottom: 12 }}>
                    <legend>Фильтры</legend>
                    {currentEntity.filters.map((flt) => {
                      const current = state.filters.find((x) => x.key === flt.key)?.value ?? '';
                      const inputType = flt.kind === 'eq' ? 'text' : 'date';
                      return (
                        <label
                          key={flt.key}
                          className="ui-inline"
                          style={{ gap: 4, marginRight: 12 }}
                        >
                          <span>{flt.label}:</span>
                          <input
                            type={inputType}
                            value={current}
                            onChange={(e) =>
                              setState((s) => ({
                                ...s,
                                filters: setFilter(s.filters, flt.key, e.target.value)
                              }))
                            }
                          />
                        </label>
                      );
                    })}
                  </fieldset>
                ) : null}

                <div className="ui-inline" style={{ gap: 8 }}>
                  <button
                    type="button"
                    className="ui-button"
                    onClick={() => void onPreview()}
                    disabled={!canRun(state) || previewPending}
                  >
                    {previewPending ? 'Строим…' : 'Превью'}
                  </button>
                  <button
                    type="button"
                    className="ui-button"
                    onClick={() => void onExport()}
                    disabled={!canRun(state) || exportPending}
                  >
                    {exportPending ? 'Готовим файл…' : 'Скачать XLSX'}
                  </button>
                </div>
              </>
            ) : (
              <SectionEmpty message="Выберите сущность, чтобы выбрать поля и фильтры" />
            )}

            {notice ? <p className="ui-callout">{notice}</p> : null}
            {actionError ? <SectionError message={actionError} /> : null}
          </SectionCard>

          {currentEntity ? (
            <SectionCard title="Сохранённые шаблоны">
              <div className="ui-inline" style={{ gap: 8, marginBottom: 12 }}>
                <input
                  type="text"
                  placeholder="Название шаблона"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                />
                <button
                  type="button"
                  className="ui-button"
                  onClick={() => void onSave()}
                  disabled={!canRun(state) || savePending}
                >
                  {savePending ? 'Сохраняем…' : 'Сохранить шаблон'}
                </button>
              </div>
              {(templates ?? []).length === 0 ? (
                <SectionEmpty message="Пока нет сохранённых шаблонов" />
              ) : (
                <ul className="ui-list">
                  {(templates ?? []).map((tpl) => (
                    <li
                      key={tpl.id}
                      className="ui-inline"
                      style={{ gap: 8, justifyContent: 'space-between' }}
                    >
                      <span>
                        {tpl.name} <span className="ui-text-muted">({tpl.entityKey})</span>
                      </span>
                      <span className="ui-inline" style={{ gap: 4 }}>
                        <button
                          type="button"
                          className="ui-button"
                          onClick={() => onLoadTemplate(tpl)}
                        >
                          Загрузить
                        </button>
                        <button
                          type="button"
                          className="ui-button"
                          onClick={() => void onDeleteTemplate(tpl.id)}
                        >
                          Удалить
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          ) : null}

          {previewData ? (
            <SectionCard
              title={`Превью${previewData.truncated ? ` (показаны первые ${previewData.rows.length} из ${previewData.total})` : ` (${previewData.total})`}`}
            >
              {previewData.rows.length === 0 ? (
                <SectionEmpty message="Нет строк по заданным условиям" />
              ) : (
                <DataTable<PreviewRow>
                  columns={previewData.columns.map((c) => ({
                    key: c.key,
                    title: c.header,
                    render: (row: PreviewRow) => formatCell(row[c.key] ?? null)
                  }))}
                  rows={previewRows}
                />
              )}
            </SectionCard>
          ) : null}
        </>
      ) : null}
    </PageContainer>
  );
}
