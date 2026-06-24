'use client';

import { DataTable, FilterBar } from '@trudskill/ui';
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

const TARGET_LABELS: Record<SystemFormTemplate['target'], string> = {
  learner: 'Слушатель',
  group: 'Группа',
  counterparty: 'Контрагент'
};
const STATUS_LABELS: Record<SystemFormTemplate['status'], string> = {
  draft: 'Черновик',
  active: 'Активный'
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
              <option value="learner">Слушатель</option>
              <option value="group">Группа</option>
              <option value="counterparty">Контрагент</option>
            </select>
            <button
              type="button"
              className="ui-button ui-button--primary"
              onClick={addTemplate}
              disabled={!name.trim()}
            >
              Добавить шаблон
            </button>
          </FilterBar>
        </SectionCard>
        <SectionCard title="Реестр форм">
          {rows.length ? (
            <DataTable
              columns={[
                { key: 'name', title: 'Название' },
                { key: 'target', title: 'Назначение', render: (row) => TARGET_LABELS[row.target] },
                { key: 'status', title: 'Статус', render: (row) => STATUS_LABELS[row.status] }
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
