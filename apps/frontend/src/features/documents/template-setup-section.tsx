'use client';

import { useQueryClient } from '@tanstack/react-query';
import { DataTable, FilePicker, LoadingState } from '@trudskill/ui';
import { useState } from 'react';

import { documentsApi } from './api';
import {
  useActiveVersionId,
  useTemplateBindings,
  useTemplateVariables,
  useTemplateVersions
} from './hooks';
import { SectionEmpty } from '../../components/state-wrappers';
import { useAuth } from '../auth/context';
import { useCoursesList, useDirectionsList, useGroupsList } from '../mvp/hooks';
import {
  type TemplateParseResult,
  fetchPreviewPdfUrl,
  putTemplateFile,
  templatesApi
} from '../templates/api';

const PAGE = { page: 1, page_size: 100 };

/** Категории переменных (миграция 0032 фиксирует состав). Код в подпись не выносится. */
const VARIABLE_CATEGORIES: Array<{ value: string; label: string }> = [
  { value: 'tenant', label: 'Учебный центр' },
  { value: 'group', label: 'Учебная группа' },
  { value: 'learner', label: 'Слушатель' },
  { value: 'counterparty', label: 'Заказчик' },
  { value: 'course', label: 'Курс' },
  { value: 'commission', label: 'Комиссия' },
  { value: 'document', label: 'Документ' },
  { value: 'program', label: 'Программа' },
  { value: 'enrollment', label: 'Зачисление' },
  { value: 'group_learners', label: 'Слушатели группы' }
];

const BIND_TYPE_LABELS: Record<string, string> = {
  group: 'Учебная группа',
  course: 'Курс',
  direction: 'Направление'
};

/*
 * Настройка бланка (Фаза 4, срез 7). Открывается панелью из строки шаблона — раньше секция
 * висела посреди страницы и писала «Сначала выберите шаблон в блоке генерации», то есть
 * отправляла человека в другой блок ниже по странице.
 *
 * Тексты: «плейсхолдеры» → «метки бланка», категории без латиницы в скобках, колонки
 * `fileId` / `groupId` / `courseId` заменены на человеческие значения.
 */
export const TemplateSetupSection = ({
  templateId,
  onError
}: {
  templateId: string;
  onError: (message: string | null) => void;
}) => {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [blankFile, setBlankFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [parseResult, setParseResult] = useState<TemplateParseResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [varCode, setVarCode] = useState('');
  const [varDisplayName, setVarDisplayName] = useState('');
  const [varCategory, setVarCategory] = useState('learner');
  const [bindType, setBindType] = useState<'course' | 'group' | 'direction'>('group');
  const [bindTargetId, setBindTargetId] = useState('');

  const versionsQuery = useTemplateVersions(templateId);
  const activeTemplateVersionId = useActiveVersionId(templateId);
  const variablesQuery = useTemplateVariables(activeTemplateVersionId);
  const bindingsQuery = useTemplateBindings(templateId);
  const groups = useGroupsList(PAGE);
  const courses = useCoursesList(PAGE);
  const directions = useDirectionsList(PAGE);

  const groupName = new Map((groups.data?.items ?? []).map((g) => [g.id, g.name]));
  const courseName = new Map((courses.data?.items ?? []).map((c) => [c.id, c.title]));

  /**
   * ФТ-A3.1/A3.2/A3.4: выбрал .docx → интент → PUT в хранилище → новая версия → активация →
   * разбор меток. Раньше на этом месте админ вписывал идентификатор файла руками.
   */
  const uploadTemplateVersion = async () => {
    if (!session || !templateId) return;
    const file = blankFile;
    if (!file) {
      onError('Выберите файл бланка в формате .docx');
      return;
    }
    setUploading(true);
    onError(null);
    setParseResult(null);
    try {
      const intent = await templatesApi.uploadUrl(session, {
        originalName: file.name,
        sizeBytes: file.size
      });
      await putTemplateFile(intent.uploadUrl, file);
      const created = await templatesApi.createVersion(session, {
        templateId,
        fileId: intent.fileId
      });
      await templatesApi.activateVersion(session, created.id);
      // Сразу показываем, что система распознала в бланке (ФТ-A3.2).
      setParseResult(await templatesApi.parseVariables(session, created.id));
      setBlankFile(null);
      await queryClient.invalidateQueries({ queryKey: ['documents'] });
      await queryClient.invalidateQueries({ queryKey: ['template-versions'] });
      await queryClient.invalidateQueries({ queryKey: ['template-variables'] });
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Не удалось загрузить бланк');
    } finally {
      setUploading(false);
    }
  };

  /** ФТ-A3.3: пример PDF на демо-данных — открывается в новой вкладке. */
  const openPreview = async (versionId: string) => {
    if (!session) return;
    setPreviewing(true);
    onError(null);
    try {
      const url = await fetchPreviewPdfUrl(session, versionId);
      window.open(url, '_blank', 'noopener');
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Не удалось получить предпросмотр');
    } finally {
      setPreviewing(false);
    }
  };

  const addVariable = async () => {
    if (!session || !activeTemplateVersionId || !varCode.trim() || !varDisplayName.trim()) return;
    try {
      onError(null);
      await documentsApi.createVariable(session, {
        templateVersionId: activeTemplateVersionId,
        variableCode: varCode.trim(),
        displayName: varDisplayName.trim(),
        categoryCode: varCategory,
        // Тип значения раньше вводили строкой в поле с подсказкой «string» — и никто, кроме
        // разработчика, не знал, что туда писать. Все существующие метки — текстовые.
        dataType: 'string',
        isRequired: false
      });
      setVarCode('');
      setVarDisplayName('');
      await queryClient.invalidateQueries({ queryKey: ['template-variables'] });
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Не удалось добавить метку');
    }
  };

  const addBinding = async () => {
    if (!session || !templateId || !bindTargetId) return;
    try {
      onError(null);
      await documentsApi.createBinding(session, {
        templateId,
        bindType,
        groupId: bindType === 'group' ? bindTargetId : undefined,
        courseId: bindType === 'course' ? bindTargetId : undefined,
        directionId: bindType === 'direction' ? bindTargetId : undefined
      });
      setBindTargetId('');
      await queryClient.invalidateQueries({ queryKey: ['template-bindings'] });
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Не удалось привязать шаблон');
    }
  };

  const bindOptions =
    bindType === 'group'
      ? (groups.data?.items ?? []).map((g) => ({ id: g.id, label: `${g.name} (${g.code})` }))
      : bindType === 'course'
        ? (courses.data?.items ?? []).map((c) => ({ id: c.id, label: c.title }))
        : (directions.data?.items ?? []).map((d) => ({ id: d.id, label: d.name }));

  return (
    <div className="ui-stack">
      <p className="ui-hint">
        Загрузите бланк в формате <code>.docx</code> — система создаст новую версию, сделает её
        действующей и покажет, какие метки в бланке распознаны. «Пример PDF» заполнит бланк
        выдуманными данными, чтобы проверить вёрстку до реальной выдачи.
      </p>

      <h3 className="ui-subheading">Версии бланка</h3>
      {versionsQuery.isLoading ? <LoadingState message="Загружаем версии…" /> : null}
      {versionsQuery.data?.items?.length ? (
        <DataTable
          columns={[
            { key: 'versionNo', title: 'Версия' },
            { key: 'stateView', title: 'Статус' }
          ]}
          rows={versionsQuery.data.items.map((item) => ({
            versionNo: item.versionNo,
            stateView: item.isActive ? 'Действующая' : 'Старая'
          }))}
        />
      ) : (
        <SectionEmpty
          message="Бланк ещё не загружен"
          hint="Пока бланка нет, документы по этому шаблону не выпускаются."
        />
      )}
      <div className="ui-inline">
        <FilePicker
          ariaLabel="Файл бланка в формате .docx"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          disabled={uploading}
          fileName={blankFile?.name ?? null}
          onSelect={setBlankFile}
        />
        <button
          type="button"
          className="ui-button--primary"
          onClick={() => void uploadTemplateVersion()}
          disabled={uploading}
        >
          {uploading ? 'Загружаем…' : 'Загрузить бланк'}
        </button>
        {activeTemplateVersionId ? (
          <button
            type="button"
            className="ui-button-secondary"
            onClick={() => void openPreview(activeTemplateVersionId)}
            disabled={previewing}
          >
            {previewing ? 'Готовим пример…' : 'Пример PDF'}
          </button>
        ) : null}
      </div>

      {parseResult ? (
        <div className="ui-stack" data-testid="template-parse-result">
          <h3 className="ui-subheading">Что система нашла в бланке</h3>
          {parseResult.known.length ? (
            <DataTable
              columns={[
                { key: 'code', title: 'Метка в бланке' },
                { key: 'category', title: 'Откуда берётся' },
                { key: 'description', title: 'Что подставится' }
              ]}
              rows={parseResult.known}
            />
          ) : (
            <SectionEmpty
              message="В бланке не нашлось ни одной знакомой метки"
              hint="Метки пишутся в фигурных скобках, например {ФИО}. Проверьте написание в файле."
            />
          )}
          {parseResult.unknown.length ? (
            <p role="alert" className="ui-error" data-testid="template-unknown-placeholders">
              Эти метки система не знает — проверьте написание, иначе они останутся пустыми:{' '}
              {parseResult.unknown.join(', ')}
            </p>
          ) : (
            <p className="ui-text-muted">Все метки бланка распознаны.</p>
          )}
          {parseResult.imagePlaceholders?.length ? (
            <p className="ui-text-muted" data-testid="template-image-placeholders">
              Картинки в бланке: {parseResult.imagePlaceholders.join(', ')} — подставятся из раздела
              «Подпись и печать».
            </p>
          ) : null}
          {parseResult.warnings?.length ? (
            <div role="alert" className="ui-error" data-testid="template-warnings">
              <ul>
                {parseResult.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {parseResult.compliance && !parseResult.compliance.isCompliant ? (
            <div role="status" data-testid="protocol-compliance-gaps">
              <strong>Протокол: не хватает обязательных реквизитов</strong>
              <p className="ui-text-muted">
                Проверка мягкая — бланк сохранится. Если реквизит вписан в бланк текстом,
                предупреждение можно игнорировать.
              </p>
              <ul>
                {parseResult.compliance.missing.map((gap) => (
                  <li key={gap.code}>
                    {gap.title} <span className="ui-text-muted">({gap.basis})</span> — например{' '}
                    {gap.expected.map((code) => `{${code}}`).join(' или ')}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {parseResult.compliance?.isCompliant ? (
            <p className="ui-text-muted">
              Протокол: обязательные реквизиты п. 92 ПП 2464 на месте.
            </p>
          ) : null}
        </div>
      ) : null}

      <h3 className="ui-subheading">Метки действующей версии</h3>
      {variablesQuery.isLoading ? <LoadingState message="Загружаем метки…" /> : null}
      {variablesQuery.data?.items?.length ? (
        <DataTable
          columns={[
            { key: 'variableCode', title: 'Метка в бланке' },
            { key: 'displayName', title: 'Что это' },
            { key: 'categoryView', title: 'Откуда берётся' }
          ]}
          rows={variablesQuery.data.items.map((item) => ({
            variableCode: item.variableCode,
            displayName: item.displayName,
            categoryView:
              VARIABLE_CATEGORIES.find((c) => c.value === item.categoryCode)?.label ??
              item.categoryCode
          }))}
        />
      ) : (
        <SectionEmpty
          message="Меток пока нет"
          hint="Метки появляются сами при загрузке бланка. Добавьте вручную, если нужной метки в бланке ещё нет."
        />
      )}
      <div className="ui-inline">
        <label className="ui-field">
          <span className="ui-field-label">Метка в бланке</span>
          <input value={varCode} onChange={(e) => setVarCode(e.target.value)} placeholder="ФИО" />
        </label>
        <label className="ui-field">
          <span className="ui-field-label">Что это</span>
          <input
            value={varDisplayName}
            onChange={(e) => setVarDisplayName(e.target.value)}
            placeholder="Фамилия и имя слушателя"
          />
        </label>
        <label className="ui-field">
          <span className="ui-field-label">Откуда берётся</span>
          <select value={varCategory} onChange={(e) => setVarCategory(e.target.value)}>
            {VARIABLE_CATEGORIES.map((category) => (
              <option key={category.value} value={category.value}>
                {category.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="ui-button-secondary"
          onClick={() => void addVariable()}
          disabled={!varCode.trim() || !varDisplayName.trim()}
        >
          Добавить метку
        </button>
      </div>

      <h3 className="ui-subheading">Где применяется</h3>
      {bindingsQuery.data?.items?.length ? (
        <DataTable
          columns={[
            { key: 'typeView', title: 'Применяется к' },
            { key: 'targetView', title: 'Название' }
          ]}
          rows={bindingsQuery.data.items.map((item) => ({
            typeView: BIND_TYPE_LABELS[item.bindType] ?? item.bindType,
            targetView:
              (item.groupId ? groupName.get(item.groupId) : undefined) ??
              (item.courseId ? courseName.get(item.courseId) : undefined) ??
              '—'
          }))}
        />
      ) : (
        <SectionEmpty
          message="Шаблон ни к чему не привязан"
          hint="Привязка говорит системе, для каких групп или курсов брать именно этот бланк."
        />
      )}
      <div className="ui-inline">
        <label className="ui-field">
          <span className="ui-field-label">Применять к</span>
          <select
            value={bindType}
            onChange={(e) => {
              setBindType(e.target.value as typeof bindType);
              setBindTargetId('');
            }}
          >
            <option value="group">Учебной группе</option>
            <option value="course">Курсу</option>
            <option value="direction">Направлению</option>
          </select>
        </label>
        <label className="ui-field">
          <span className="ui-field-label">Что выбираем</span>
          <select value={bindTargetId} onChange={(e) => setBindTargetId(e.target.value)}>
            <option value="">— выберите —</option>
            {bindOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="ui-button-secondary"
          onClick={() => void addBinding()}
          disabled={!bindTargetId}
        >
          Привязать
        </button>
      </div>
    </div>
  );
};
