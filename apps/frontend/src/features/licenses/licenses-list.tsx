'use client';

import {
  DetailDrawer,
  Form,
  FormActions,
  FormField,
  ListPage,
  SelectField,
  StatusChip,
  TextareaField,
  useConfirmDialog
} from '@trudskill/ui';
import { type FormEvent, type ReactElement, useState } from 'react';

import { useLicenses, useLicensesMutations } from './hooks';
import {
  ALL_LICENSE_TYPES,
  type CreateLicensePayload,
  LICENSE_STATUS_LABELS,
  LICENSE_STATUS_TONE,
  LICENSE_TYPE_LABELS,
  type LicenseStatus,
  type LicenseType,
  type TrainingLicense
} from './types';
import { PageContainer, PageHeader, SectionError } from '../../components/state-wrappers';
import { formatDate } from '../mvp/screen-helpers';

const STATUS_FILTER_OPTIONS: Array<{ value: LicenseStatus | ''; label: string }> = [
  { value: '', label: 'Все' },
  { value: 'active', label: 'Действующие' },
  { value: 'expired', label: 'Истёкшие' },
  { value: 'revoked', label: 'Отозванные' }
];

const EMPTY_DRAFT: CreateLicensePayload = {
  licenseType: 'education_license',
  licenseNumber: '',
  issuerName: '',
  issuedAt: ''
};

interface LicenseRow extends TrainingLicense {
  typeView: string;
  validityView: string;
  statusView: ReactElement;
}

/**
 * Реестр лицензий и аккредитаций центра (Pillar A Plan C §5.10).
 *
 * Шаблон `TPL-001`: первичное действие «Добавить лицензию» — в шапке, форма открывается
 * панелью. Раньше форма из шести полей висела развёрнутой под таблицей — экран отвечал
 * «заполни меня» вместо «вот твои лицензии», а первичного действия глазом было не найти
 * (`UI-007`). Та же беда чинилась на заказах в срезе 16 и на закрытии группы в срезе 6.
 */
export function LicensesView() {
  const { ask, dialog } = useConfirmDialog();
  const [statusFilter, setStatusFilter] = useState<LicenseStatus | ''>('');
  const { data, isLoading, error } = useLicenses(statusFilter === '' ? undefined : statusFilter);
  const { createPending, revokePending, createLicense, revokeLicense } = useLicensesMutations();

  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState<CreateLicensePayload>(EMPTY_DRAFT);
  const [validUntil, setValidUntil] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const touched =
    draft.licenseNumber.trim() !== '' ||
    draft.issuerName.trim() !== '' ||
    draft.issuedAt !== '' ||
    validUntil !== '' ||
    notes.trim() !== '';

  const closeForm = () => {
    setFormOpen(false);
    setDraft(EMPTY_DRAFT);
    setValidUntil('');
    setNotes('');
    setFormError(null);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!draft.licenseNumber.trim() || !draft.issuerName.trim() || !draft.issuedAt) {
      setFormError('Заполните номер, орган выдачи и дату выдачи');
      return;
    }
    try {
      const payload: CreateLicensePayload = {
        licenseType: draft.licenseType,
        licenseNumber: draft.licenseNumber.trim(),
        issuerName: draft.issuerName.trim(),
        issuedAt: draft.issuedAt
      };
      if (validUntil) payload.validUntil = validUntil;
      const trimmedNotes = notes.trim();
      if (trimmedNotes) payload.notes = trimmedNotes;
      await createLicense(payload);
      closeForm();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Не удалось добавить лицензию');
    }
  };

  // CMP-006: диалог приложения вместо window.confirm — тот не переводится,
  // не проходит проверку на 360px и не отличает опасное действие от обычного.
  const onRevoke = (license: TrainingLicense) => {
    ask(
      {
        title: 'Отозвать лицензию',
        message: `Лицензия № ${license.licenseNumber} (${LICENSE_TYPE_LABELS[license.licenseType]}) перестанет действовать. Отзыв нельзя отменить, а без действующей лицензии нельзя опубликовать программу.`,
        confirmLabel: 'Отозвать лицензию',
        tone: 'danger'
      },
      () => void revokeLicense(license.id)
    );
  };

  const rows: LicenseRow[] = (data?.items ?? []).map((license) => ({
    ...license,
    typeView: LICENSE_TYPE_LABELS[license.licenseType],
    validityView: license.validUntil
      ? `${formatDate(license.issuedAt)} — ${formatDate(license.validUntil)}`
      : `${formatDate(license.issuedAt)} — бессрочно`,
    statusView: (
      <StatusChip
        status={LICENSE_STATUS_TONE[license.status]}
        label={LICENSE_STATUS_LABELS[license.status]}
      />
    )
  }));

  return (
    <PageContainer>
      <PageHeader
        title="Лицензии и аккредитации"
        subtitle="Образовательные лицензии центра, аккредитации, членство в СРО. Без действующей лицензии нельзя опубликовать программу."
        actions={
          <button type="button" className="ui-button-primary" onClick={() => setFormOpen(true)}>
            Добавить лицензию
          </button>
        }
      />

      <ListPage<LicenseRow>
        filters={
          <SelectField
            label="Статус"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as LicenseStatus | '')}
            options={STATUS_FILTER_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          />
        }
        columns={[
          { key: 'typeView', title: 'Вид' },
          { key: 'licenseNumber', title: 'Номер' },
          { key: 'issuerName', title: 'Орган выдачи' },
          { key: 'validityView', title: 'Срок действия' },
          { key: 'statusView', title: 'Статус', render: (row) => row.statusView }
        ]}
        rows={rows}
        isLoading={isLoading}
        error={error ? new Error('Не удалось загрузить лицензии') : undefined}
        rowKey={(row) => row.id}
        rowActions={(row) =>
          row.status === 'active'
            ? [
                {
                  label: 'Отозвать',
                  danger: true,
                  disabled: revokePending,
                  onSelect: () => onRevoke(row)
                }
              ]
            : []
        }
        emptyMessage="Лицензии не добавлены"
        emptyHint="Лицензия подтверждает право центра обучать по программе. Пока её нет, программу нельзя опубликовать."
        emptyAction={{ label: 'Добавить лицензию', onSelect: () => setFormOpen(true) }}
      />

      <DetailDrawer
        open={formOpen}
        onClose={closeForm}
        title="Добавить лицензию"
        subtitle="Данные берутся из бланка лицензии"
        hasUnsavedChanges={touched}
      >
        <Form onSubmit={(e) => void onSubmit(e)}>
          <SelectField
            label="Вид"
            value={draft.licenseType}
            onChange={(e) =>
              setDraft((d) => ({ ...d, licenseType: e.target.value as LicenseType }))
            }
            options={ALL_LICENSE_TYPES.map((t) => ({ value: t, label: LICENSE_TYPE_LABELS[t] }))}
          />
          <FormField
            label="Номер"
            value={draft.licenseNumber}
            onChange={(e) => setDraft((d) => ({ ...d, licenseNumber: e.target.value }))}
            placeholder="Л-2024-001"
            required
          />
          <FormField
            label="Орган выдачи"
            value={draft.issuerName}
            onChange={(e) => setDraft((d) => ({ ...d, issuerName: e.target.value }))}
            placeholder="Рособрнадзор"
            required
          />
          <FormField
            label="Дата выдачи"
            type="date"
            value={draft.issuedAt}
            onChange={(e) => setDraft((d) => ({ ...d, issuedAt: e.target.value }))}
            required
          />
          <FormField
            label="Действует до"
            type="date"
            hint="Оставьте пустым, если лицензия бессрочная"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
          />
          <TextareaField
            label="Заметки"
            hint="Например, на какие направления обучения распространяется"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          {formError ? <SectionError message={formError} /> : null}
          <FormActions>
            <button type="submit" className="ui-button-primary" disabled={createPending}>
              {createPending ? 'Сохраняем…' : 'Добавить лицензию'}
            </button>
            <button type="button" className="ui-button" onClick={closeForm}>
              Отмена
            </button>
          </FormActions>
        </Form>
      </DetailDrawer>
      {dialog}
    </PageContainer>
  );
}
