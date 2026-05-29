'use client';

import { LoadingState } from '@cdoprof/ui';
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
          <button
            type="button"
            className="ui-button ui-button--primary"
            onClick={() => setEditing(true)}
          >
            Редактировать
          </button>
        }
      />

      <SectionCard title="Основные данные">
        <dl className="ui-data-list">
          <div className="ui-data-list__row">
            <dt>Код</dt>
            <dd>{c.code}</dd>
          </div>
          <div className="ui-data-list__row">
            <dt>ИНН</dt>
            <dd>{formatInn(c.inn)}</dd>
          </div>
          <div className="ui-data-list__row">
            <dt>КПП</dt>
            <dd>{c.kpp ?? '—'}</dd>
          </div>
          <div className="ui-data-list__row">
            <dt>Email</dt>
            <dd>{c.contactEmail ?? '—'}</dd>
          </div>
          <div className="ui-data-list__row">
            <dt>Телефон</dt>
            <dd>{formatPhone(c.contactPhone)}</dd>
          </div>
          <div className="ui-data-list__row">
            <dt>Юр. адрес</dt>
            <dd>{c.legalAddress ?? '—'}</dd>
          </div>
          <div className="ui-data-list__row">
            <dt>Заметка</dt>
            <dd>{c.note ?? '—'}</dd>
          </div>
          <div className="ui-data-list__row">
            <dt>Статус</dt>
            <dd>{CLIENT_STATUS_LABEL[c.status]}</dd>
          </div>
        </dl>
      </SectionCard>

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
