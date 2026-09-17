'use client';

import { DataTable, FormField, LoadingState, SelectField, useConfirmDialog } from '@trudskill/ui';
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
import { FORMS, withPlural } from '../../lib/format/plural';

import type {
  BuilderState,
  ReportEntityKey,
  ReportEntityMeta,
  ReportPreview,
  ReportTemplate
} from './types';

const EMPTY_STATE: BuilderState = { entityKey: '', selectedFields: [], filters: [] };

type PreviewRow = Record<string, string | number | null> & { id: string };

interface TemplateRow {
  id: string;
  name: string;
  aboutView: string;
  columnsView: string;
  authorView: string;
}

/**
 * «Кто завёл шаблон» (§5.432).
 *
 * Сервер хранил автора и присылал его, а экран не показывал: по отчёту потом спрашивают
 * «откуда эти цифры», и первый вопрос — кто этот отчёт настроил. Имя подставляет СЕРВЕР:
 * сырой идентификатор человеку показывать нельзя (правило продукта №2), а справочник имён
 * на стороне экрана врёт на удалённых записях.
 */
const templateAuthor = (template: {
  createdBy?: string;
  createdByName?: string | null;
}): string => {
  if (!template.createdBy) return '—';
  return template.createdByName ?? 'учётная запись удалена';
};

/** Название набора данных словом; незнакомый ключ показываем как есть, а не прячем. */
function entityLabel(entities: ReportEntityMeta[], key: string): string {
  return entities.find((e) => e.key === key)?.label ?? key;
}

function formatCell(value: string | number | null): string {
  return value === null || value === undefined || value === '' ? '—' : String(value);
}

export function ReportBuilderScreen(): ReactElement {
  const { ask, dialog } = useConfirmDialog();
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

  // CMP-006: подтверждение удаления — диалог приложения.
  const onDeleteTemplate = (id: string, name: string) => {
    ask(
      {
        title: 'Удалить шаблон отчёта',
        /* ТЗ 5.3: диалог называет объект — какой именно шаблон. */
        message: `Шаблон «${name}» исчезнет из списка. Уже выгруженные отчёты останутся на месте.`,
        confirmLabel: 'Удалить шаблон',
        tone: 'danger'
      },
      () => void runDeleteTemplate(id)
    );
  };

  const runDeleteTemplate = async (id: string) => {
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
            <SelectField
              label="О чём отчёт"
              hint="От этого зависит, какие столбцы и условия отбора доступны дальше"
              value={state.entityKey}
              onChange={(e) => onSelectEntity(e.target.value as ReportEntityKey | '')}
            >
              <option value="">— выберите —</option>
              {meta.entities.map((ent) => (
                <option key={ent.key} value={ent.key}>
                  {ent.label}
                </option>
              ))}
            </SelectField>

            {currentEntity ? (
              <>
                <fieldset className="ui-fieldset">
                  <legend>Столбцы отчёта</legend>
                  <div className="ui-inline">
                    {currentEntity.fields.map((f) => (
                      <label key={f.key} className="ui-inline">
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
                  </div>
                </fieldset>

                {currentEntity.filters.length > 0 ? (
                  <fieldset className="ui-fieldset">
                    <legend>Условия отбора</legend>
                    <div className="ui-inline">
                      {currentEntity.filters.map((flt) => {
                        const current = state.filters.find((x) => x.key === flt.key)?.value ?? '';
                        const inputType = flt.kind === 'eq' ? 'text' : 'date';
                        return (
                          <label key={flt.key} className="ui-inline">
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
                    </div>
                  </fieldset>
                ) : null}

                <div className="ui-inline">
                  <button
                    type="button"
                    className={`ui-button ${previewPending ? 'ui-button--loading' : ''}`}
                    onClick={() => void onPreview()}
                    disabled={!canRun(state) || previewPending}
                  >
                    Показать пример строк
                  </button>
                  <button
                    type="button"
                    className={`ui-button-primary ${exportPending ? 'ui-button--loading' : ''}`}
                    onClick={() => void onExport()}
                    disabled={!canRun(state) || exportPending}
                  >
                    Скачать в Excel
                  </button>
                </div>
              </>
            ) : (
              <SectionEmpty
                message="Выберите сущность, чтобы выбрать поля и фильтры"
                hint="Сначала выберите, о чём отчёт: о слушателях, группах или документах."
              />
            )}

            {notice ? <p className="ui-callout">{notice}</p> : null}
            {actionError ? <SectionError message={actionError} /> : null}
          </SectionCard>

          {currentEntity ? (
            <SectionCard title="Сохранённые шаблоны">
              <div className="ui-inline">
                <FormField
                  label="Название шаблона"
                  hint="По нему вы найдёте набор столбцов и условий в следующий раз"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                />
                <button
                  type="button"
                  className={`ui-button ${savePending ? 'ui-button--loading' : ''}`}
                  onClick={() => void onSave()}
                  disabled={!canRun(state) || savePending}
                >
                  Сохранить шаблон
                </button>
              </div>
              {(templates ?? []).length === 0 ? (
                <SectionEmpty
                  message="Пока нет сохранённых шаблонов"
                  hint="Шаблон запоминает выбранные поля и условия, чтобы не собирать отчёт заново."
                />
              ) : (
                <DataTable<TemplateRow>
                  columns={[
                    { key: 'name', title: 'Название' },
                    { key: 'aboutView', title: 'О чём' },
                    { key: 'columnsView', title: 'Столбцов' },
                    /*
                     * §5.432: шаблон отчёта заводит человек, и по отчёту потом спрашивают —
                     * «откуда эти цифры». Колонок было три при бюджете семь (§13.2), место
                     * есть.
                     */
                    { key: 'authorView', title: 'Кто завёл' }
                  ]}
                  rows={(templates ?? []).map((tpl) => ({
                    id: tpl.id,
                    name: tpl.name,
                    /*
                     * Раньше рядом с названием стоял код сущности — «Отчёт по ОТ (learners)».
                     * Показываем то же словом, из справочника, который прислал сервер.
                     */
                    aboutView: entityLabel(meta.entities, tpl.entityKey),
                    columnsView: String(tpl.selectedFields.length),
                    authorView: templateAuthor(tpl)
                  }))}
                  rowKey={(row) => row.id}
                  rowActions={(row) => {
                    const tpl = (templates ?? []).find((x) => x.id === row.id);
                    return tpl
                      ? [
                          { label: 'Загрузить шаблон', onSelect: () => onLoadTemplate(tpl) },
                          {
                            label: 'Удалить шаблон',
                            danger: true,
                            onSelect: () => onDeleteTemplate(tpl.id, tpl.name)
                          }
                        ]
                      : [];
                  }}
                />
              )}
            </SectionCard>
          ) : null}

          {previewData ? (
            <SectionCard title="Пример строк отчёта">
              <p className="ui-text-muted">
                {previewData.truncated
                  ? `Показаны первые ${withPlural(previewData.rows.length, FORMS.row)} из ${previewData.total}. В файл попадут все.`
                  : `Строк в отчёте: ${previewData.total}.`}
              </p>
              {previewData.rows.length === 0 ? (
                <SectionEmpty
                  message="Нет строк по заданным условиям"
                  hint="Попробуйте расширить период или снять часть условий."
                />
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
      {dialog}
    </PageContainer>
  );
}
