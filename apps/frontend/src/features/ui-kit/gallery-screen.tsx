'use client';

import {
  Button,
  DetailLayout,
  Form,
  FormActions,
  FormField,
  KeyValueList,
  ListPage,
  SelectField,
  StatGrid,
  StatusChip
} from '@trudskill/ui';
import { useState } from 'react';

import { PageContainer, PageHeader, SectionCard } from '../../components/state-wrappers';

import type { Column } from '@trudskill/ui';

interface DemoRow {
  id: string;
  name: string;
  group: string;
  status: string;
}

const DEMO_ROWS: DemoRow[] = [
  { id: '1', name: 'Иванов Иван Иванович', group: 'ПБ-07', status: 'active' },
  { id: '2', name: 'Петрова Мария Сергеевна', group: 'ОТ-12', status: 'in_progress' },
  { id: '3', name: 'Сидоров Пётр Алексеевич', group: 'ПБ-07', status: 'completed' }
];

const DEMO_COLUMNS: Column<DemoRow>[] = [
  { key: 'name', title: 'ФИО' },
  { key: 'group', title: 'Группа' },
  { key: 'status', title: 'Статус', render: (r) => <StatusChip status={r.status} /> }
];

export function UiKitGalleryScreen() {
  const [empty, setEmpty] = useState(false);

  return (
    <PageContainer>
      <PageHeader
        title="Витрина шаблонов (UI Kit)"
        subtitle="Эталонные каркасы Фазы 3 на фиктивных данных. Справочная страница для миграции экранов."
      />

      <SectionCard title="Dashboard — StatGrid">
        <StatGrid
          items={[
            { label: 'Слушателей', value: 1248 },
            { label: 'Активных групп', value: 37 },
            { label: 'Документов за месяц', value: 512, sub: '+8% к июню' }
          ]}
        />
      </SectionCard>

      <SectionCard
        title="Список — ListPage"
        actions={
          <Button variant="secondary" onClick={() => setEmpty((v) => !v)}>
            {empty ? 'Показать данные' : 'Показать пустое состояние'}
          </Button>
        }
      >
        <ListPage<DemoRow>
          columns={DEMO_COLUMNS}
          rows={empty ? [] : DEMO_ROWS}
          isLoading={false}
          emptyMessage="Записей нет"
          emptyHint="Переключите тумблер выше."
          page={1}
          totalPages={3}
          onPageChange={() => {}}
        />
      </SectionCard>

      <SectionCard title="Карточка — DetailLayout">
        <DetailLayout
          aside={
            <div className="ui-section-card">
              <h3 className="ui-section-title">Сведения</h3>
              <KeyValueList
                items={[
                  { label: 'Email', value: 'ivanov@mail.ru' },
                  { label: 'Группа', value: 'ПБ-07' },
                  { label: 'Статус', value: <StatusChip status="active" /> }
                ]}
              />
            </div>
          }
        >
          <SectionCard title="Прогресс обучения">
            <p className="ui-prose-muted">Основная колонка: секции, связанные списки, действия.</p>
          </SectionCard>
        </DetailLayout>
      </SectionCard>

      <SectionCard title="Форма — Form + FormField + SelectField">
        <Form onSubmit={(e) => e.preventDefault()}>
          <FormField label="Название" defaultValue="Пожарная безопасность" required />
          <FormField label="Код курса" defaultValue="ПБ-07" error="Код уже используется" />
          <SelectField
            label="Направление"
            defaultValue="pb"
            options={[
              { value: 'pb', label: 'Пожарная безопасность' },
              { value: 'ot', label: 'Охрана труда' }
            ]}
          />
          <FormActions>
            <Button variant="secondary" type="button">
              Отмена
            </Button>
            <Button variant="primary" type="submit">
              Сохранить
            </Button>
          </FormActions>
        </Form>
      </SectionCard>
    </PageContainer>
  );
}
