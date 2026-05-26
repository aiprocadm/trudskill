'use client';

import { DataTable, LoadingState, StatusChip } from '@cdoprof/ui';
import { type FormEvent, type ReactElement, useState } from 'react';

import { useLicenses, useLicensesMutations } from './hooks';
import {
  ALL_LICENSE_TYPES,
  type CreateLicensePayload,
  LICENSE_STATUS_LABELS,
  LICENSE_TYPE_LABELS,
  type LicenseStatus,
  type LicenseType,
  type TrainingLicense
} from './types';
import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../components/state-wrappers';

const STATUS_FILTER_OPTIONS: Array<{ value: LicenseStatus | ''; label: string }> = [
  { value: '', label: 'Все' },
  { value: 'active', label: 'Действующие' },
  { value: 'expired', label: 'Истёкшие' },
  { value: 'revoked', label: 'Отозванные' }
];

interface LicenseRow extends TrainingLicense {
  no: string;
  typeView: string;
  numberView: string;
  validityView: string;
  statusView: ReactElement;
  actionsView: ReactElement;
}

/**
 * Pillar A Plan C §5.10 — UI лицензий учебного центра.
 *
 * Реестр + минимальная форма создания. Edit вынесен в follow-up
 * (требует separate modal/route); revoke — кнопка в строке.
 */
export function LicensesView() {
  const [statusFilter, setStatusFilter] = useState<LicenseStatus | ''>('');
  const { data, isLoading, error } = useLicenses(statusFilter === '' ? undefined : statusFilter);
  const { createPending, revokePending, createLicense, revokeLicense } = useLicensesMutations();

  const [draft, setDraft] = useState<CreateLicensePayload>({
    licenseType: 'education_license',
    licenseNumber: '',
    issuerName: '',
    issuedAt: ''
  });
  const [validUntil, setValidUntil] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const resetForm = () => {
    setDraft({
      licenseType: 'education_license',
      licenseNumber: '',
      issuerName: '',
      issuedAt: ''
    });
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
      resetForm();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Не удалось создать лицензию');
    }
  };

  const onRevoke = async (id: string) => {
    if (!window.confirm('Отозвать лицензию? Это действие нельзя отменить.')) return;
    await revokeLicense(id);
  };

  return (
    <PageContainer>
      <PageHeader
        title="Лицензии и аккредитации"
        subtitle="Образовательные лицензии центра, аккредитации, членство в СРО. Без активной лицензии нельзя опубликовать программу."
      />

      <SectionCard title="Реестр лицензий">
        <div className="ui-inline" style={{ marginBottom: 12, gap: 8 }}>
          <label className="ui-inline" style={{ gap: 4 }}>
            <span>Статус:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as LicenseStatus | '')}
            >
              {STATUS_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {isLoading ? <LoadingState message="Загрузка реестра…" /> : null}
        {error ? <SectionError message="Не удалось загрузить лицензии" /> : null}
        {!isLoading && !error && (data?.items.length ?? 0) === 0 ? (
          <SectionEmpty
            message="Лицензии не добавлены"
            hint="Добавьте первую лицензию в форме ниже"
          />
        ) : null}
        {!isLoading && data && data.items.length > 0 ? (
          <DataTable<LicenseRow>
            columns={[
              { key: 'no', title: '№' },
              { key: 'typeView', title: 'Тип' },
              { key: 'numberView', title: 'Номер' },
              { key: 'issuerName', title: 'Орган выдачи' },
              { key: 'validityView', title: 'Срок действия' },
              { key: 'statusView', title: 'Статус', render: (row) => row.statusView },
              { key: 'actionsView', title: 'Действия', render: (row) => row.actionsView }
            ]}
            rows={data.items.map(
              (license, idx): LicenseRow => ({
                ...license,
                no: String(idx + 1),
                typeView: LICENSE_TYPE_LABELS[license.licenseType],
                numberView: license.licenseNumber,
                validityView: `${license.issuedAt}${license.validUntil ? ` — ${license.validUntil}` : ' — бессрочно'}`,
                statusView: <StatusChip status={LICENSE_STATUS_LABELS[license.status]} />,
                actionsView:
                  license.status === 'active' ? (
                    <button
                      type="button"
                      className="ui-button"
                      onClick={() => void onRevoke(license.id)}
                      disabled={revokePending}
                    >
                      Отозвать
                    </button>
                  ) : (
                    <span style={{ color: '#888' }}>—</span>
                  )
              })
            )}
          />
        ) : null}
      </SectionCard>

      <SectionCard title="Добавить лицензию">
        <form onSubmit={(e) => void onSubmit(e)} className="ui-stack" style={{ gap: 8 }}>
          <label className="ui-stack" style={{ gap: 4 }}>
            <span>Тип</span>
            <select
              value={draft.licenseType}
              onChange={(e) =>
                setDraft((d) => ({ ...d, licenseType: e.target.value as LicenseType }))
              }
            >
              {ALL_LICENSE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {LICENSE_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="ui-stack" style={{ gap: 4 }}>
            <span>Номер</span>
            <input
              value={draft.licenseNumber}
              onChange={(e) => setDraft((d) => ({ ...d, licenseNumber: e.target.value }))}
              placeholder="Л-2024-001"
              required
            />
          </label>
          <label className="ui-stack" style={{ gap: 4 }}>
            <span>Орган выдачи</span>
            <input
              value={draft.issuerName}
              onChange={(e) => setDraft((d) => ({ ...d, issuerName: e.target.value }))}
              placeholder="Рособрнадзор"
              required
            />
          </label>
          <label className="ui-stack" style={{ gap: 4 }}>
            <span>Дата выдачи</span>
            <input
              type="date"
              value={draft.issuedAt}
              onChange={(e) => setDraft((d) => ({ ...d, issuedAt: e.target.value }))}
              required
            />
          </label>
          <label className="ui-stack" style={{ gap: 4 }}>
            <span>Действительна до (необязательно)</span>
            <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          </label>
          <label className="ui-stack" style={{ gap: 4 }}>
            <span>Заметки</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          {formError ? <SectionError message={formError} /> : null}
          <button type="submit" className="ui-button" disabled={createPending}>
            {createPending ? 'Сохраняем…' : 'Добавить лицензию'}
          </button>
        </form>
      </SectionCard>
    </PageContainer>
  );
}
