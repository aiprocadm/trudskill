'use client';

import { AsyncSection, DataTable, LoadingState, StatusChip, useConfirmDialog } from '@trudskill/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import { FieldError } from '../../components/form-feedback';
import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../components/state-wrappers';
import { ApiClientError } from '../../lib/api/client';
import { useCommission, useCommissions, useDomainMutations } from '../mvp/hooks';
import { buildCommissionInfoPayload } from '../mvp/payloads';

import type {
  Commission,
  CommissionMember,
  CommissionMemberRole,
  CommissionStatus
} from '../mvp/types';
import type { Column } from '@trudskill/ui';
import type { ReactElement } from 'react';

/*
 * Перенесены «как есть» из features/mvp/screens.tsx (§8.3, порядок 7; правило SCR-001).
 * Редизайн — следующим коммитом.
 */

// === Pillar A — Plan A: commissions admin screens ===

const COMMISSION_MEMBER_ROLE_LABELS: Record<CommissionMemberRole, string> = {
  chairman: 'Председатель',
  deputy_chairman: 'Зам. председателя',
  member: 'Член',
  secretary: 'Секретарь',
  external_expert: 'Внешний эксперт'
};

export const CommissionsPageScreen = () => {
  const router = useRouter();
  const [status, setStatus] = useState<CommissionStatus | ''>('active');
  const filterStatus: CommissionStatus | undefined = status === '' ? undefined : status;
  const { data, loading, error, refetch } = useCommissions(filterStatus);
  const { createCommission } = useDomainMutations();

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) {
      setSaveError('Код и название обязательны');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const trimmedDescription = description.trim();
      const payload: { code: string; name: string; description?: string } = {
        code: code.trim(),
        name: name.trim()
      };
      if (trimmedDescription) payload.description = trimmedDescription;
      const created = await createCommission(payload);
      setCode('');
      setName('');
      setDescription('');
      router.push(`/admin/commissions/${created.id}`);
    } catch (err) {
      setSaveError(err instanceof ApiClientError ? err.message : 'Не удалось создать комиссию');
    } finally {
      setSaving(false);
    }
  };

  const commissionColumns: Column<Commission>[] = [
    { key: 'code', title: 'Код' },
    { key: 'name', title: 'Название' },
    {
      key: 'status',
      title: 'Статус',
      render: (row) => <StatusChip status={row.status} />
    },
    {
      key: 'id',
      title: '',
      render: (row) => <Link href={`/admin/commissions/${row.id}`}>Открыть</Link>
    }
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Аттестационные комиссии"
        subtitle="Составы для регулируемого ДПО — подписывают пакеты выходных документов"
      />
      <SectionCard title="Реестр комиссий">
        <div className="ui-inline" style={{ marginBottom: 12 }}>
          <label>
            Статус:&nbsp;
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as CommissionStatus | '')}
            >
              <option value="active">Активные</option>
              <option value="archived">Архивные</option>
              <option value="">Все</option>
            </select>
          </label>
          <button type="button" className="ui-button" onClick={() => void refetch()}>
            Обновить
          </button>
        </div>
        <AsyncSection
          isLoading={loading}
          error={error ? new Error(error) : undefined}
          isEmpty={!!data && data.items.length === 0}
          loadingMessage="Загрузка…"
          emptyMessage="Комиссии не созданы"
          emptyHint="Создайте первую комиссию ниже"
        >
          <DataTable columns={commissionColumns} rows={data?.items ?? []} />
        </AsyncSection>
      </SectionCard>

      <SectionCard title="Создать новую комиссию">
        <form onSubmit={(e) => void onCreate(e)} className="ui-stack">
          <label>
            Код
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="например, OT_2026"
              required
            />
          </label>
          <label>
            Название
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Комиссия по охране труда"
              required
            />
          </label>
          <label>
            Описание (необязательно)
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          {saveError ? <FieldError id="commission-create-error" message={saveError} /> : null}
          <button type="submit" className="ui-button ui-button--primary" disabled={saving}>
            {saving ? 'Создаём…' : 'Создать комиссию'}
          </button>
        </form>
      </SectionCard>
    </PageContainer>
  );
};

export const CommissionDetailsScreen = ({ id }: { id: string }) => {
  const { ask, dialog } = useConfirmDialog();
  const { data, loading, error, refetch } = useCommission(id);
  const { updateCommission, archiveCommission, addCommissionMember, removeCommissionMember } =
    useDomainMutations();

  const [role, setRole] = useState<CommissionMemberRole>('member');
  const [externalFullName, setExternalFullName] = useState('');
  const [externalPosition, setExternalPosition] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const [editingInfo, setEditingInfo] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const onStartEditInfo = () => {
    if (!data) return;
    setEditName(data.name);
    setEditDescription(data.description ?? '');
    setEditError(null);
    setEditingInfo(true);
  };

  const onCancelEditInfo = () => {
    setEditingInfo(false);
    setEditError(null);
  };

  const onSaveEditInfo = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedName = editName.trim();
    if (!trimmedName) {
      setEditError('Название не может быть пустым');
      return;
    }
    setSavingEdit(true);
    setEditError(null);
    try {
      await updateCommission(id, buildCommissionInfoPayload(editName, editDescription));
      await refetch();
      setEditingInfo(false);
    } catch (err) {
      setEditError(err instanceof ApiClientError ? err.message : 'Не удалось сохранить изменения');
    } finally {
      setSavingEdit(false);
    }
  };

  const onAddMember = async (e: FormEvent) => {
    e.preventDefault();
    if (!externalFullName.trim()) {
      setAddError('Введите ФИО члена комиссии');
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      const nextPosition = data?.members.length ?? 0;
      const trimmedPosition = externalPosition.trim();
      const payload: {
        role: CommissionMemberRole;
        externalFullName: string;
        externalPosition?: string;
        positionInOrder: number;
      } = {
        role,
        externalFullName: externalFullName.trim(),
        positionInOrder: nextPosition
      };
      if (trimmedPosition) payload.externalPosition = trimmedPosition;
      await addCommissionMember(id, payload);
      setExternalFullName('');
      setExternalPosition('');
      await refetch();
    } catch (err) {
      setAddError(err instanceof ApiClientError ? err.message : 'Не удалось добавить члена');
    } finally {
      setAdding(false);
    }
  };

  /*
   * CMP-006. Здесь стояли ДВА подтверждения, написанных голой формой вызова — без префикса
   * `window`. Поиск по строке «window .confirm» их не находил, поэтому в аудите ТЗ они всплыли
   * отдельной находкой. Оба переведены на диалог приложения.
   */
  const onArchive = () => {
    ask(
      {
        title: 'Заархивировать комиссию',
        message:
          'Комиссию нельзя будет привязать к новым курсам. Уже выданные протоколы и документы останутся на месте.',
        confirmLabel: 'Заархивировать',
        tone: 'danger'
      },
      () => void runArchive()
    );
  };

  const runArchive = async () => {
    await archiveCommission(id);
    await refetch();
  };

  const onRemove = (memberId: string) => {
    ask(
      {
        title: 'Удалить члена комиссии',
        message: 'Человек перестанет числиться в составе комиссии.',
        confirmLabel: 'Удалить из состава',
        tone: 'danger'
      },
      () => void runRemove(memberId)
    );
  };

  const runRemove = async (memberId: string) => {
    await removeCommissionMember(id, memberId);
    await refetch();
  };

  const memberColumns: Column<CommissionMember>[] = [
    { key: 'positionInOrder', title: '#' },
    {
      key: 'role',
      title: 'Роль',
      render: (row) => COMMISSION_MEMBER_ROLE_LABELS[row.role]
    },
    { key: 'externalFullName', title: 'ФИО' },
    { key: 'externalPosition', title: 'Должность' },
    {
      key: 'id',
      title: '',
      render: (row) => (
        <button type="button" className="ui-button-link" onClick={() => void onRemove(row.id)}>
          Удалить
        </button>
      )
    }
  ];

  const headerProps: { title: string; subtitle?: string; actions?: ReactElement } = {
    title: data ? data.name : 'Комиссия'
  };
  if (data) headerProps.subtitle = `Код: ${data.code}`;
  if (data && data.status === 'active') {
    headerProps.actions = (
      <button type="button" className="ui-button" onClick={() => void onArchive()}>
        Заархивировать
      </button>
    );
  }

  return (
    <PageContainer>
      <PageHeader {...headerProps} />
      {loading ? <LoadingState message="Загрузка…" /> : null}
      {error ? <SectionError message={error} /> : null}
      {data ? (
        <>
          <SectionCard title="Информация">
            {editingInfo ? (
              <form onSubmit={(e) => void onSaveEditInfo(e)} className="ui-stack">
                <label>
                  Название
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Постоянно действующая аттестационная комиссия"
                    required
                  />
                </label>
                <label>
                  Описание (необязательно)
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="Назначение, область компетенции, особенности работы"
                    rows={3}
                  />
                </label>
                {editError ? (
                  <FieldError id="commission-edit-info-error" message={editError} />
                ) : null}
                <div className="ui-inline">
                  <button type="submit" className="ui-button" disabled={savingEdit}>
                    {savingEdit ? 'Сохранение…' : 'Сохранить'}
                  </button>
                  <button
                    type="button"
                    className="ui-button-link"
                    onClick={onCancelEditInfo}
                    disabled={savingEdit}
                  >
                    Отмена
                  </button>
                </div>
              </form>
            ) : (
              <div className="ui-stack">
                <div>
                  <strong>Код:</strong> {data.code}
                </div>
                <div>
                  <strong>Описание:</strong>{' '}
                  {data.description ? data.description : <em>не задано</em>}
                </div>
                {data.status === 'active' ? (
                  <div>
                    <button type="button" className="ui-button" onClick={onStartEditInfo}>
                      Изменить
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Состав комиссии">
            {data.members.length > 0 ? (
              <DataTable columns={memberColumns} rows={data.members} />
            ) : (
              <SectionEmpty message="Члены комиссии не добавлены" />
            )}
          </SectionCard>

          {data.status === 'active' ? (
            <SectionCard title="Добавить члена">
              <form onSubmit={(e) => void onAddMember(e)} className="ui-stack">
                <label>
                  Роль
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as CommissionMemberRole)}
                  >
                    {Object.entries(COMMISSION_MEMBER_ROLE_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  ФИО
                  <input
                    value={externalFullName}
                    onChange={(e) => setExternalFullName(e.target.value)}
                    placeholder="Иванов Иван Иванович"
                    required
                  />
                </label>
                <label>
                  Должность (необязательно)
                  <input
                    value={externalPosition}
                    onChange={(e) => setExternalPosition(e.target.value)}
                    placeholder="Главный специалист"
                  />
                </label>
                {addError ? (
                  <FieldError id="commission-add-member-error" message={addError} />
                ) : null}
                <button type="submit" className="ui-button" disabled={adding}>
                  {adding ? 'Добавляем…' : 'Добавить'}
                </button>
              </form>
            </SectionCard>
          ) : null}
        </>
      ) : null}
      {dialog}
    </PageContainer>
  );
};
