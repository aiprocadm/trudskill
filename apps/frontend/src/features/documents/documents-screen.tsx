'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { GenerationSection } from './generation-section';
import { useDocumentsOverview } from './hooks';
import { TemplateSetupSection } from './template-setup-section';
import { TemplatesSection } from './templates-section';
import { PageContainer, PageHeader, SectionError } from '../../components/state-wrappers';
import { useTaskRealtime } from '../communication/hooks';
import { NumberingRulesSection } from '../numbering/screens';
import { TenantImagesSection } from '../tenant-images/screens';

/*
 * §8.3: файл был крупнейшим в приложении (763 строки, 20 переменных состояния и фактически
 * три экрана в одном). Разобран на секции переносом «как есть» — правило SCR-001: сначала
 * перенос (диф читается как перемещение), потом редизайн под TPL-001.
 */
export function DocumentsScreen() {
  const queryClient = useQueryClient();
  const [templateType, setTemplateType] = useState('certificate');
  const [generateTemplateId, setGenerateTemplateId] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const data = useDocumentsOverview();

  useTaskRealtime(
    data.data?.tasks[0]?.id,
    () => void queryClient.invalidateQueries({ queryKey: ['documents'] })
  );

  return (
    <PageContainer>
      <PageHeader
        title="Документы"
        subtitle="Шаблоны, генерация, batch-выпуск и контроль статусов по задачам"
        actions={<button onClick={() => void data.refetch()}>Обновить</button>}
      />
      {/* Общая ошибка загрузки — на уровне экрана: данные тянет он, ему и отвечать. */}
      {data.error ? (
        <SectionError
          message={
            data.error instanceof Error ? data.error.message : 'Не удалось загрузить документы'
          }
          onRetry={() => void data.refetch()}
        />
      ) : null}
      <TemplatesSection
        templates={data.data?.templates ?? []}
        isLoading={data.isLoading}
        templateType={templateType}
        onTemplateTypeChange={setTemplateType}
        onCreated={() => data.refetch()}
        onError={setActionError}
      />
      <TemplateSetupSection templateId={generateTemplateId} onError={setActionError} />
      <GenerationSection
        templates={data.data?.templates ?? []}
        tasks={data.data?.tasks ?? []}
        templateId={generateTemplateId}
        onTemplateIdChange={setGenerateTemplateId}
        templateType={templateType}
        onRefetch={() => data.refetch()}
        actionError={actionError}
        onError={setActionError}
      />
      <NumberingRulesSection />
      <TenantImagesSection />
    </PageContainer>
  );
}
