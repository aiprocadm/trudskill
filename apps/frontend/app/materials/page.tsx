'use client';

import { ListPage } from '@trudskill/ui';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { PageContainer, PageHeader, SectionCard } from '../../src/components/state-wrappers';
import { materialTypeLabel, viewTimeLabel } from '../../src/features/courses/labels';
import { useMaterials, useModules } from '../../src/features/mvp/hooks';
import { VideoUploadSection } from '../../src/features/video-upload/screens';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

export default function MaterialsHubPage() {
  const [moduleId, setModuleId] = useState('');
  const { data, loading, error } = useMaterials(moduleId || undefined);
  // Фаза 6 срез 6 (id-input-ban): отбор по НАЗВАНИЮ модуля вместо «вставьте module_id».
  const modules = useModules();
  const moduleTitle = useMemo(
    () => new Map((modules.data?.items ?? []).map((m) => [m.id, m.title])),
    [modules.data]
  );

  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader title="Материалы" subtitle="Модули и материалы курсов" />
        <SectionCard title="Реестр материалов">
          {/* GOAL-4: каркас списка — из дизайн-системы, состояния не переписываются руками. */}
          <ListPage
            isLoading={loading}
            error={error}
            rows={data?.items ?? []}
            emptyMessage="Материалы не найдены"
            emptyHint="Добавьте материалы в карточке курса."
            filters={
              <>
                <label className="ui-field">
                  <span className="ui-field-label">Модуль</span>
                  <select
                    className="ui-select"
                    value={moduleId}
                    onChange={(event) => setModuleId(event.target.value)}
                  >
                    <option value="">Все модули</option>
                    {(modules.data?.items ?? []).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.title}
                      </option>
                    ))}
                  </select>
                </label>
                <Link href="/courses">Открыть карточки курсов</Link>
              </>
            }
            columns={[
              { key: 'title', title: 'Название' },
              {
                key: 'materialType',
                title: 'Вид',
                render: (row) => materialTypeLabel(row.materialType)
              },
              {
                key: 'moduleId',
                title: 'Модуль',
                render: (row) => moduleTitle.get(row.moduleId) ?? 'Модуль без названия'
              },
              {
                key: 'minViewSeconds',
                title: 'Минимальный просмотр',
                render: (row) => viewTimeLabel(row.minViewSeconds)
              }
            ]}
          />
        </SectionCard>
        <VideoUploadSection />
      </PageContainer>
    </ProtectedPage>
  );
}
