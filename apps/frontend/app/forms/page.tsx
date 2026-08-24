'use client';

import { FilterBar, ListPage } from '@trudskill/ui';
import { useState } from 'react';

import { PageContainer, PageHeader, SectionCard } from '../../src/components/state-wrappers';
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
        <PageHeader
          title="Системные формы"
          subtitle="Анкеты, которые заполняют слушатели и заказчики обучения"
        />
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
          {/*
            GOAL-4: каркас списка — из дизайн-системы.

            ⚠️ Раздел пока ничего не сохраняет: серверной части у системных форм нет
            (`grep` по бэкенду не находит ни ручки, ни таблицы), список живёт в памяти
            страницы и исчезает при перезагрузке. Экран, который выглядит рабочим и молча
            теряет введённое, — обман; поэтому пустое состояние говорит об этом прямо.
            Записано в журнал расхождений (запись 197).
          */}
          <ListPage<SystemFormTemplate>
            isLoading={false}
            rows={rows}
            rowKey={(row) => row.id}
            emptyMessage="Шаблоны форм ещё не добавлены"
            emptyHint="Форма — анкета, которую заполняет слушатель или заказчик. Раздел готовится: добавленные здесь шаблоны пока не сохраняются на сервере и пропадут при перезагрузке страницы."
            columns={[
              { key: 'name', title: 'Название' },
              { key: 'target', title: 'Назначение', render: (row) => TARGET_LABELS[row.target] },
              { key: 'status', title: 'Статус', render: (row) => STATUS_LABELS[row.status] }
            ]}
          />
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
