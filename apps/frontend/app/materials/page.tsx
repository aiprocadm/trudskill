'use client';

import { DataTable, FilterBar, LoadingState } from '@trudskill/ui';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../src/components/state-wrappers';
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
        <PageHeader title="Учебный контент" subtitle="Модули и материалы курсов" />
        <SectionCard title="Реестр материалов">
          <FilterBar>
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
          </FilterBar>
          {loading ? <LoadingState message="Загружаем материалы…" /> : null}
          {error ? <SectionError message={error} /> : null}
          {!loading && !error && !data?.items.length ? (
            <SectionEmpty
              message="Материалы не найдены"
              hint="Добавьте материалы в карточке курса."
            />
          ) : null}
          {data?.items.length ? (
            <DataTable
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
              rows={data.items}
            />
          ) : null}
        </SectionCard>
        <VideoUploadSection />
      </PageContainer>
    </ProtectedPage>
  );
}
