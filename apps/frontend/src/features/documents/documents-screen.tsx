'use client';

import { useQueryClient } from '@tanstack/react-query';
import { DetailDrawer } from '@trudskill/ui';
import { useState } from 'react';

import { CreateTemplateDrawer } from './create-template-drawer';
import { GenerateDocumentDrawer } from './generate-document-drawer';
import { useDocumentsOverview } from './hooks';
import { TasksSection } from './tasks-section';
import { TemplateSetupSection } from './template-setup-section';
import { TemplatesSection } from './templates-section';
import { PageContainer, PageHeader, SectionError } from '../../components/state-wrappers';
import { hasPermission } from '../../lib/rbac/permissions';
import { useAuth } from '../auth/context';
import { useTaskRealtime } from '../communication/hooks';
import { NumberingRulesSection } from '../numbering/screens';
import { TenantImagesSection } from '../tenant-images/screens';

/*
 * TPL-001 (Фаза 4, срез 7). Файл был крупнейшим в приложении: 763 строки, 20 переменных
 * состояния и фактически три экрана в одном. Сначала разобран переносом «как есть»
 * (SCR-001, отдельный коммит), теперь редизайн.
 *
 * Главное изменение — порядок работы. Было: реестр шаблонов сверху, отдельный блок настройки
 * посреди страницы с надписью «Сначала выберите шаблон в блоке генерации», и сам выбор — в
 * выпадающем списке ещё ниже. Стало: шаблон выбирается кликом по своей строке, а настройка
 * и выпуск открываются панелями рядом с ним.
 */
export function DocumentsScreen() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  /* ТЗ 5.2: «Создать шаблон» без права на бланки — действие вхолостую; скрывается. */
  const canEditTemplates = hasPermission(session?.permissions ?? [], 'documents.write');
  const [setupTemplateId, setSetupTemplateId] = useState<string | null>(null);
  const [generateTemplateId, setGenerateTemplateId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const data = useDocumentsOverview();
  const templates = data.data?.templates ?? [];

  useTaskRealtime(
    data.data?.tasks[0]?.id,
    () => void queryClient.invalidateQueries({ queryKey: ['documents'] })
  );

  const templateById = (id: string | null) =>
    templates.find((item) => (item.id ?? item.name) === id) ?? null;
  const setupTemplate = templateById(setupTemplateId);

  return (
    <PageContainer>
      <PageHeader
        title="Шаблоны документов"
        subtitle="Бланки удостоверений, протоколов и приказов: настройка и выпуск"
        /* UI-007/UI-003: одно первичное действие И один акцент. Пока шаблонов нет,
           первое действие предлагает сам пустой экран («Создать первый шаблон») —
           кнопка в шапке дублировала бы коралл (запись 107). */
        {...(templates.length > 0 && canEditTemplates
          ? { primaryAction: { label: 'Создать шаблон', onSelect: () => setCreateOpen(true) } }
          : {})}
      />

      {data.error ? (
        <SectionError
          message={
            data.error instanceof Error ? data.error.message : 'Не удалось загрузить шаблоны'
          }
          onRetry={() => void data.refetch()}
        />
      ) : null}
      {actionError ? <SectionError message={actionError} /> : null}

      <TemplatesSection
        templates={templates}
        isLoading={data.isLoading}
        onSetup={setSetupTemplateId}
        onGenerate={setGenerateTemplateId}
        onCreate={() => setCreateOpen(true)}
      />

      <TasksSection tasks={data.data?.tasks ?? []} onRefetch={() => data.refetch()} />

      <NumberingRulesSection />
      <TenantImagesSection />

      <CreateTemplateDrawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => data.refetch()}
      />

      {setupTemplate ? (
        <DetailDrawer
          open={true}
          title={`Бланк: ${setupTemplate.name}`}
          width="lg"
          onClose={() => {
            setSetupTemplateId(null);
            setActionError(null);
          }}
        >
          <TemplateSetupSection
            templateId={setupTemplate.id ?? setupTemplate.name}
            onError={setActionError}
          />
        </DetailDrawer>
      ) : null}

      <GenerateDocumentDrawer
        template={templateById(generateTemplateId)}
        onClose={() => setGenerateTemplateId(null)}
        onDone={() => data.refetch()}
      />
    </PageContainer>
  );
}
