'use client';

import { DetailLayout, KeyValueList, LoadingState, PageTabs, TabPanel } from '@trudskill/ui';
import Link from 'next/link';
import { useState } from 'react';

import { ClientContactsSection } from './client-contacts-section';
import { ClientEditDrawer } from './client-edit-drawer';
import { ClientEmployeesSection } from './client-employees-section';
import { CLIENT_STATUS_LABEL, clientRequisiteRows, formatInn, formatPhone } from './format';
import { GroupProgressSection } from './group-progress-section';
import { useClient } from './hooks';
import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../components/state-wrappers';
import { useObjectCrumb } from '../navigation/use-object-crumb';
import { useTabParam } from '../navigation/use-tab-param';

/* МГ-D2.1 (срез 14.2): у компании — люди. Обучение по группам — первой вкладкой, как было. */
const CLIENT_CARD_TABS = [
  { id: 'learning', label: 'Обучение' },
  { id: 'contacts', label: 'Контакты' },
  { id: 'employees', label: 'Сотрудники' }
];
const TAB_IDS = CLIENT_CARD_TABS.map((tab) => tab.id);

interface ClientDetailScreenProps {
  clientId: string;
}

export function ClientDetailScreen({ clientId }: ClientDetailScreenProps) {
  const client = useClient(clientId);
  useObjectCrumb(client.data?.name, {
    failed: Boolean(client.error),
    notFound: !client.isLoading && !client.error && !client.data
  });
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useTabParam(TAB_IDS, 'learning');

  if (client.isLoading) {
    return (
      <PageContainer>
        <LoadingState message="Загрузка…" />
      </PageContainer>
    );
  }

  if (client.error) {
    return (
      <PageContainer>
        <SectionError
          message={
            client.error instanceof Error ? client.error.message : 'Не удалось загрузить компанию'
          }
          onRetry={() => void client.refetch()}
        />
      </PageContainer>
    );
  }

  if (!client.data) {
    return (
      <PageContainer>
        <SectionEmpty
          message="Компания не найдена"
          hint="Проверьте ссылку или перейдите к списку."
        />
      </PageContainer>
    );
  }

  const c = client.data;
  const requisites = clientRequisiteRows(c);

  return (
    <PageContainer>
      <PageHeader
        title={c.name}
        subtitle={c.legalName ?? CLIENT_STATUS_LABEL[c.status]}
        primaryAction={{ label: 'Редактировать', onSelect: () => setEditing(true) }}
      />

      <DetailLayout
        aside={
          <SectionCard title="Основные данные">
            <KeyValueList
              items={[
                { label: 'Код', value: c.code },
                { label: 'ИНН', value: formatInn(c.inn) },
                { label: 'КПП', value: c.kpp ?? '—' },
                { label: 'Почта', value: c.contactEmail ?? '—' },
                { label: 'Телефон', value: formatPhone(c.contactPhone) },
                { label: 'Юр. адрес', value: c.legalAddress ?? '—' },
                { label: 'Заметка', value: c.note ?? '—' },
                { label: 'Статус', value: CLIENT_STATUS_LABEL[c.status] }
              ]}
            />
            {/* МГ-D1.1: реквизиты, руководитель, договор и менеджер — только заполненные. */}
            <h3 className="ui-section-title">Реквизиты и договор</h3>
            {requisites.length > 0 ? (
              <KeyValueList items={requisites} />
            ) : (
              <p className="ui-muted">
                Реквизиты не заполнены. Нажмите «Редактировать» и «Заполнить по ИНН» — пустые поля
                заполнятся из реестра.
              </p>
            )}
          </SectionCard>
        }
      >
        <PageTabs
          tabs={CLIENT_CARD_TABS}
          activeId={tab}
          onSelect={setTab}
          label="Разделы карточки компании"
        />

        <TabPanel id="learning" activeId={tab}>
          <GroupProgressSection clientId={c.id} />

          <SectionCard title="Связанные группы">
            <p>
              {/*
              Ссылка вела на `/admin/groups` — такого маршрута нет вовсе, человек попадал
              на «страница не найдена». Реестр групп живёт на `/groups`. Стрелка из подписи
              убрана: она требует догадки, а название и так говорит, куда ведёт (журнал 86).
            */}
              <Link href="/groups">Открыть реестр групп</Link>
            </p>
            <p className="ui-muted">
              Для привязки группы к компании откройте детали группы и выберите эту компанию в
              селекте «Компания-заказчик».
            </p>
          </SectionCard>
        </TabPanel>

        <TabPanel id="contacts" activeId={tab}>
          <ClientContactsSection counterpartyId={c.id} active={tab === 'contacts'} />
        </TabPanel>

        <TabPanel id="employees" activeId={tab}>
          <ClientEmployeesSection counterpartyId={c.id} active={tab === 'employees'} />
        </TabPanel>
      </DetailLayout>

      {editing ? (
        <ClientEditDrawer
          client={c}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            void client.refetch();
          }}
        />
      ) : null}
    </PageContainer>
  );
}
