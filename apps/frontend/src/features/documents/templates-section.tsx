'use client';

import { DataTable, LoadingState, StatusChip } from '@trudskill/ui';
import { useState } from 'react';

import { type TemplateDto, documentsApi } from './api';
import { SectionCard, SectionEmpty } from '../../components/state-wrappers';
import { useAuth } from '../auth/context';

/*
 * Перенесён «как есть» из documents-screen.tsx (§8.3, SCR-001: перенос и редизайн — разные
 * шаги). Разметка и поведение дословно прежние; редизайн под TPL-001 — следующим коммитом.
 */
export const TemplatesSection = ({
  templates,
  isLoading,
  templateType,
  onTemplateTypeChange,
  onCreated,
  onError
}: {
  templates: TemplateDto[];
  isLoading: boolean;
  templateType: string;
  onTemplateTypeChange: (value: string) => void;
  onCreated: () => Promise<unknown>;
  onError: (message: string | null) => void;
}) => {
  const { session } = useAuth();
  const [templateName, setTemplateName] = useState('');

  const createTemplate = async () => {
    if (!session || !templateName.trim()) return;
    try {
      onError(null);
      await documentsApi.createTemplate(session, {
        name: templateName.trim(),
        templateType
      });
      setTemplateName('');
      await onCreated();
    } catch (createError) {
      onError(createError instanceof Error ? createError.message : 'Не удалось создать шаблон');
    }
  };

  return (
    <SectionCard title="Реестр шаблонов">
      {isLoading ? <LoadingState message="Загрузка шаблонов…" /> : null}
      {!isLoading && templates.length ? (
        <>
          <DataTable
            columns={[
              { key: 'name', title: 'Шаблон' },
              { key: 'type', title: 'Тип' },
              { key: 'currentVersion', title: 'Версия' },
              { key: 'updatedAt', title: 'Обновлен' }
            ]}
            rows={templates}
          />
          <div className="ui-inline">
            {templates.map((item) => (
              <StatusChip key={item.name} status={item.status} />
            ))}
          </div>
        </>
      ) : null}
      {!isLoading && !templates.length ? <SectionEmpty message="Шаблоны не найдены" /> : null}
      <div className="ui-stack">
        <strong>Создать шаблон</strong>
        <div className="ui-inline">
          <input
            value={templateName}
            onChange={(event) => setTemplateName(event.target.value)}
            placeholder="Название шаблона"
          />
          <select
            value={templateType}
            onChange={(event) => onTemplateTypeChange(event.target.value)}
          >
            {/* Pillar A Plan B §5.4: 7 регулируемых типов + contract grandfathered. */}
            <option value="certificate">Удостоверение</option>
            <option value="protocol">Протокол</option>
            <option value="order">Приказ</option>
            <option value="diploma">Диплом</option>
            <option value="attestation">Свидетельство об аттестации</option>
            <option value="reference">Справка</option>
            <option value="report">Отчёт</option>
            <option value="contract">Договор</option>
          </select>
          <button
            type="button"
            onClick={() => void createTemplate()}
            disabled={!templateName.trim()}
          >
            Создать шаблон
          </button>
        </div>
      </div>
    </SectionCard>
  );
};
