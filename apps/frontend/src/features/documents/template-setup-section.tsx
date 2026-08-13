'use client';

import { useQueryClient } from '@tanstack/react-query';
import { DataTable, LoadingState } from '@trudskill/ui';
import { useRef, useState } from 'react';

import { documentsApi } from './api';
import {
  useActiveVersionId,
  useTemplateBindings,
  useTemplateVariables,
  useTemplateVersions
} from './hooks';
import { SectionCard, SectionEmpty } from '../../components/state-wrappers';
import { useAuth } from '../auth/context';
import {
  type TemplateParseResult,
  fetchPreviewPdfUrl,
  putTemplateFile,
  templatesApi
} from '../templates/api';

/*
 * Перенесён «как есть» из documents-screen.tsx (§8.3, SCR-001). Поведение дословно прежнее.
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [parseResult, setParseResult] = useState<TemplateParseResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [varCode, setVarCode] = useState('');
  const [varDisplayName, setVarDisplayName] = useState('');
  const [varCategory, setVarCategory] = useState('learner');
  const [varDataType, setVarDataType] = useState('string');
  const [bindType, setBindType] = useState<'course' | 'group' | 'direction'>('group');
  const [bindGroupId, setBindGroupId] = useState('');
  const [bindCourseId, setBindCourseId] = useState('');
  const [bindDirectionId, setBindDirectionId] = useState('');

  const versionsQuery = useTemplateVersions(templateId);
  const activeTemplateVersionId = useActiveVersionId(templateId);
  const variablesQuery = useTemplateVariables(activeTemplateVersionId);
  const bindingsQuery = useTemplateBindings(templateId);

  /**
   * ФТ-A3.1/A3.2/A3.4: выбрал .docx → интент → PUT в хранилище → новая версия → активация →
   * разбор плейсхолдеров. Раньше на этом месте админ вписывал fileId руками.
   */
  const uploadTemplateVersion = async () => {
    if (!session || !templateId) return;
    const file = fileInputRef.current?.files?.[0];
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
      if (fileInputRef.current) fileInputRef.current.value = '';
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
        dataType: varDataType,
        isRequired: false
      });
      setVarCode('');
      setVarDisplayName('');
      await queryClient.invalidateQueries({ queryKey: ['template-variables'] });
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Не удалось добавить переменную');
    }
  };

  const addBinding = async () => {
    if (!session || !templateId) return;
    if (bindType === 'group' && !bindGroupId.trim()) return;
    if (bindType === 'course' && !bindCourseId.trim()) return;
    if (bindType === 'direction' && !bindDirectionId.trim()) return;
    try {
      onError(null);
      await documentsApi.createBinding(session, {
        templateId,
        bindType,
        groupId: bindType === 'group' ? bindGroupId.trim() : undefined,
        courseId: bindType === 'course' ? bindCourseId.trim() : undefined,
        directionId: bindType === 'direction' ? bindDirectionId.trim() : undefined
      });
      setBindGroupId('');
      setBindCourseId('');
      setBindDirectionId('');
      await queryClient.invalidateQueries({ queryKey: ['template-bindings'] });
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Не удалось создать привязку');
    }
  };

  return (
    <SectionCard title="Версия шаблона, переменные и привязки">
      <p className="ui-text-muted">
        Выберите шаблон в списке ниже (поле «Выберите шаблон» в блоке генерации), загрузите бланк в
        формате <code>.docx</code> — система создаст новую версию, сделает её активной и покажет,
        какие плейсхолдеры распознаны. Кнопка «Пример PDF» заполнит бланк демо-данными, чтобы
        проверить вёрстку до реальной выдачи.
      </p>
      {!templateId ? <SectionEmpty message="Сначала выберите шаблон в блоке генерации" /> : null}
      {templateId ? (
        <div className="ui-stack">
          <strong>Версии</strong>
          {versionsQuery.isLoading ? <LoadingState message="Загрузка версий…" /> : null}
          {versionsQuery.data?.items?.length ? (
            <DataTable
              columns={[
                { key: 'versionNo', title: '№' },
                { key: 'fileId', title: 'fileId' },
                { key: 'isActive', title: 'Активна' }
              ]}
              rows={versionsQuery.data.items}
            />
          ) : (
            <SectionEmpty message="Версий пока нет" />
          )}
          <div className="ui-inline">
            <input
              ref={fileInputRef}
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              disabled={uploading}
              aria-label="Файл бланка (.docx)"
            />
            <button type="button" onClick={() => void uploadTemplateVersion()} disabled={uploading}>
              {uploading ? 'Загружаем…' : 'Загрузить бланк и активировать версию'}
            </button>
            {activeTemplateVersionId ? (
              <button
                type="button"
                onClick={() => void openPreview(activeTemplateVersionId)}
                disabled={previewing}
              >
                {previewing ? 'Готовим пример…' : 'Пример PDF'}
              </button>
            ) : null}
          </div>
          {parseResult ? (
            <div className="ui-stack" data-testid="template-parse-result">
              <strong>Плейсхолдеры в загруженном бланке</strong>
              {parseResult.known.length ? (
                <DataTable
                  columns={[
                    { key: 'code', title: 'Плейсхолдер' },
                    { key: 'category', title: 'Категория' },
                    { key: 'description', title: 'Что подставится' }
                  ]}
                  rows={parseResult.known}
                />
              ) : (
                <SectionEmpty message="В бланке не найдено ни одного известного плейсхолдера" />
              )}
              {parseResult.unknown.length ? (
                <p role="alert" className="ui-error" data-testid="template-unknown-placeholders">
                  Система не знает такие плейсхолдеры (проверьте написание, они останутся пустыми):{' '}
                  {parseResult.unknown.join(', ')}
                </p>
              ) : (
                <p className="ui-text-muted">Все плейсхолдеры бланка распознаны.</p>
              )}
              {parseResult.imagePlaceholders?.length ? (
                <p className="ui-text-muted" data-testid="template-image-placeholders">
                  Картинки в бланке: {parseResult.imagePlaceholders.join(', ')} — подставятся из
                  раздела «Подпись и печать».
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
          <strong>Переменные (первая активная версия)</strong>
          {variablesQuery.isLoading ? <LoadingState message="Загрузка переменных…" /> : null}
          {variablesQuery.data?.items?.length ? (
            <DataTable
              columns={[
                { key: 'variableCode', title: 'Код' },
                { key: 'displayName', title: 'Подпись' },
                { key: 'categoryCode', title: 'Категория' }
              ]}
              rows={variablesQuery.data.items}
            />
          ) : (
            <SectionEmpty message="Переменных нет — добавьте ниже" />
          )}
          <div className="ui-inline">
            <input
              value={varCode}
              onChange={(e) => setVarCode(e.target.value)}
              placeholder="variable_code"
            />
            <input
              value={varDisplayName}
              onChange={(e) => setVarDisplayName(e.target.value)}
              placeholder="Подпись"
            />
            <select value={varCategory} onChange={(e) => setVarCategory(e.target.value)}>
              {/* Pillar A Plan B §5.5: все 10 категорий, фиксированных CHECK migration 0032. */}
              <option value="tenant">Организация (tenant)</option>
              <option value="group">Группа (group)</option>
              <option value="learner">Ученик (learner)</option>
              <option value="counterparty">Контрагент (counterparty)</option>
              <option value="course">Курс (course)</option>
              <option value="commission">Комиссия (commission)</option>
              <option value="document">Документ (document)</option>
              <option value="program">Программа (program)</option>
              <option value="enrollment">Зачисление (enrollment)</option>
              <option value="group_learners">Ученики группы (group_learners)</option>
            </select>
            <input
              value={varDataType}
              onChange={(e) => setVarDataType(e.target.value)}
              placeholder="string"
            />
            <button
              type="button"
              onClick={() => void addVariable()}
              disabled={!varCode.trim() || !varDisplayName.trim()}
            >
              Добавить переменную
            </button>
          </div>
          <strong>Привязки шаблона</strong>
          {bindingsQuery.data?.items?.length ? (
            <DataTable
              columns={[
                { key: 'bindType', title: 'Тип' },
                { key: 'groupId', title: 'groupId' },
                { key: 'courseId', title: 'courseId' }
              ]}
              rows={bindingsQuery.data.items}
            />
          ) : (
            <SectionEmpty message="Привязок нет" />
          )}
          <div className="ui-inline">
            <select
              value={bindType}
              onChange={(e) => setBindType(e.target.value as typeof bindType)}
            >
              <option value="group">Группа</option>
              <option value="course">Курс</option>
              <option value="direction">Направление</option>
            </select>
            <input
              value={bindGroupId}
              onChange={(e) => setBindGroupId(e.target.value)}
              placeholder="groupId"
              disabled={bindType !== 'group'}
            />
            <input
              value={bindCourseId}
              onChange={(e) => setBindCourseId(e.target.value)}
              placeholder="courseId"
              disabled={bindType !== 'course'}
            />
            <input
              value={bindDirectionId}
              onChange={(e) => setBindDirectionId(e.target.value)}
              placeholder="directionId"
              disabled={bindType !== 'direction'}
            />
            <button type="button" onClick={() => void addBinding()}>
              Добавить привязку
            </button>
          </div>
        </div>
      ) : null}
    </SectionCard>
  );
};
