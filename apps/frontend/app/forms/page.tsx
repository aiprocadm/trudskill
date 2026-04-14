'use client';

import { DataTable, FilterBar } from '@cdoprof/ui';
import { useState } from 'react';

import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty
} from '../../src/components/state-wrappers';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

type SystemFormTemplate = {
  id: string;
  name: string;
  target: 'learner' | 'group' | 'counterparty';
  status: 'draft' | 'active';
};

export default function ModulePage() {
  const [name, setName] = useState('');
  const [target, setTarget] = useState<SystemFormTemplate['target']>('learner');
  const [rows, setRows] = useState<SystemFormTemplate[]>([]);

  const addTemplate = () => {
    if (!name.trim()) return;
    setRows((curr) => [
      { id: `form_${Date.now()}`, name: name.trim(), target, status: 'draft' },
      ...curr
    ]);
    setName('');
  };

  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader title="Системные формы" subtitle="Шаблоны форм ввода для операций LMS" />
        <SectionCard title="Новый шаблон формы">
          <FilterBar>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Название формы"
            />
            <select
              value={target}
              onChange={(event) => setTarget(event.target.value as typeof target)}
            >
              <option value="learner">learner</option>
              <option value="group">group</option>
              <option value="counterparty">counterparty</option>
            </select>
            <button type="button" onClick={addTemplate} disabled={!name.trim()}>
              Добавить шаблон
            </button>
          </FilterBar>
        </SectionCard>
        <SectionCard title="Реестр форм">
          {rows.length ? (
            <DataTable
              columns={[
                { key: 'name', title: 'Название' },
                { key: 'target', title: 'Назначение' },
                { key: 'status', title: 'Статус' }
              ]}
              rows={rows}
            />
          ) : (
            <SectionEmpty message="Шаблоны форм еще не добавлены" />
          )}
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
