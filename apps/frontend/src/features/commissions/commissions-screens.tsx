'use client';

import {
  DataTable,
  DetailDrawer,
  Form,
  FormActions,
  ListPage,
  LoadingState,
  StatusChip,
  useConfirmDialog
} from '@trudskill/ui';
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

interface CommissionRow {
  id: string;
  nameView: ReactElement;
  codeView: string;
  statusView: ReactElement;
}

/*
 * TPL-001 (Фаза 4, срез 11, волна 3). Что изменилось в реестре:
 *
 * 1. Форма создания стояла постоянным блоком ПОД таблицей, а пустой экран отправлял
 *    к ней словами «Создайте первую комиссию ниже». Теперь это первичное действие
 *    в шапке и панель; пустой экран объясняет, зачем комиссия нужна.
 * 2. Кнопка «Обновить» рядом с отбором убрана — обновление не действие (`UI-007`).
 * 3. Колонка-пустышка со ссылкой «Открыть» убрана: ссылка теперь на названии.
 * 4. Отбор: «Активные»/«Архивные» → «Действующие»/«В архиве».
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
  const [creating, setCreating] = useState(false);

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

  const rows: CommissionRow[] = (data?.items ?? []).map((item: Commission) => ({
    id: item.id,
    nameView: (
      <Link className="ui-link" href={`/admin/commissions/${item.id}`}>
        {item.name}
      </Link>
    ),
    codeView: item.code,
    statusView: <StatusChip status={item.status} />
  }));

  return (
    <PageContainer>
      <PageHeader
        title="Аттестационные комиссии"
        subtitle="Состав, который подписывает протоколы и удостоверения слушателей"
        /*
          UI-007: пока форма создания открыта, первичного действия у шапки нет. Иначе на
          экране две первичные кнопки: уже нажатая «Создать комиссию» и «Сохранить» в форме —
          и первая продолжает звать туда, где человек уже находится.
        */
        {...(creating
          ? {}
          : { primaryAction: { label: 'Создать комиссию', onSelect: () => setCreating(true) } })}
      />

      <ListPage<CommissionRow>
        filters={
          <label className="ui-field">
            <span className="ui-field-label">Статус</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as CommissionStatus | '')}
            >
              <option value="active">Действующие</option>
              <option value="archived">В архиве</option>
              <option value="">Любое</option>
            </select>
          </label>
        }
        columns={[
          { key: 'nameView', title: 'Комиссия', render: (row) => row.nameView },
          { key: 'codeView', title: 'Код' },
          { key: 'statusView', title: 'Статус', render: (row) => row.statusView }
        ]}
        rows={rows}
        isLoading={loading}
        error={error ? new Error(error) : undefined}
        onRetry={() => void refetch()}
        rowKey={(row) => row.id}
        emptyMessage="Здесь появятся аттестационные комиссии"
        emptyHint="Комиссия — состав из председателя, членов и секретаря. Она подписывает протоколы проверки знаний и удостоверения, поэтому без неё документы не выпускаются."
        emptyAction={{ label: 'Создать первую комиссию', onSelect: () => setCreating(true) }}
      />

      {creating ? (
        <DetailDrawer
          open={true}
          title="Новая комиссия"
          width="sm"
          hasUnsavedChanges={Boolean(code.trim() || name.trim())}
          onClose={() => setCreating(false)}
        >
          <Form onSubmit={(e) => void onCreate(e)} noValidate>
            <label htmlFor="commission-name" className="ui-field">
              <span className="ui-field-label">Название комиссии</span>
              <input
                id="commission-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Комиссия по охране труда"
                required
              />
              <p className="ui-field-hint">Так комиссия будет названа в протоколе.</p>
            </label>
            <label htmlFor="commission-code" className="ui-field">
              <span className="ui-field-label">Короткий код</span>
              <input
                id="commission-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="ОТ-2026"
                required
              />
              <p className="ui-field-hint">Метка для документов и выгрузок.</p>
            </label>
            <label htmlFor="commission-description" className="ui-field">
              <span className="ui-field-label">Описание (по желанию)</span>
              <textarea
                id="commission-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            {saveError ? <FieldError id="commission-create-error" message={saveError} /> : null}
            <FormActions>
              <button type="button" className="ui-button-link" onClick={() => setCreating(false)}>
                Отмена
              </button>
              <button type="submit" className="ui-button--primary" disabled={saving}>
                {saving ? 'Создаём…' : 'Создать комиссию'}
              </button>
            </FormActions>
          </Form>
        </DetailDrawer>
      ) : null}
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
              <SectionEmpty
                message="Члены комиссии не добавлены"
                hint="Комиссия подписывает протоколы: нужны председатель, секретарь и хотя бы один член."
              />
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
