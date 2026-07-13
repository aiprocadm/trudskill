'use client';

import { Button, DetailLayout, KeyValueList, LoadingState } from '@trudskill/ui';
import Link from 'next/link';
import { useState } from 'react';

import { ClientEditDrawer } from './client-edit-drawer';
import { CLIENT_STATUS_LABEL, formatInn, formatPhone } from './format';
import { GroupProgressSection } from './group-progress-section';
import { useClient } from './hooks';
import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../components/state-wrappers';

interface ClientDetailScreenProps {
  clientId: string;
}

export function ClientDetailScreen({ clientId }: ClientDetailScreenProps) {
  const client = useClient(clientId);
  const [editing, setEditing] = useState(false);

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

  return (
    <PageContainer>
      <PageHeader
        title={c.name}
        subtitle={c.legalName ?? CLIENT_STATUS_LABEL[c.status]}
        actions={
          <Button variant="primary" onClick={() => setEditing(true)}>
            Редактировать
          </Button>
        }
      />

      <DetailLayout
        aside={
          <SectionCard title="Основные данные">
            <KeyValueList
              items={[
                { label: 'Код', value: c.code },
                { label: 'ИНН', value: formatInn(c.inn) },
                { label: 'КПП', value: c.kpp ?? '—' },
                { label: 'Email', value: c.contactEmail ?? '—' },
                { label: 'Телефон', value: formatPhone(c.contactPhone) },
                { label: 'Юр. адрес', value: c.legalAddress ?? '—' },
                { label: 'Заметка', value: c.note ?? '—' },
                { label: 'Статус', value: CLIENT_STATUS_LABEL[c.status] }
              ]}
            />
          </SectionCard>
        }
      >
        <GroupProgressSection clientId={c.id} />

        <SectionCard title="Связанные группы">
          <p>
            <Link href="/admin/groups">Перейти к списку групп →</Link>
          </p>
          <p className="ui-muted">
            Для привязки группы к компании откройте детали группы и выберите эту компанию в селекте
            «Компания-заказчик».
          </p>
        </SectionCard>
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
