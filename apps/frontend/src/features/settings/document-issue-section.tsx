'use client';

import { useQueryClient } from '@tanstack/react-query';
import { LoadingState } from '@trudskill/ui';
import { type ReactElement, useEffect, useState } from 'react';

import { SectionCard, SectionError } from '../../components/state-wrappers';
import { useUnsavedForm } from '../../components/use-unsaved-form';
import { hasPermission } from '../../lib/rbac/permissions';
import { tenantApi } from '../../lib/tenant/tenant-api';
import { useAuth } from '../auth/context';
import { TENANT_SETTINGS_QUERY_KEY, useTenantSettings } from '../learners/use-extra-fields';
import { readApiMessage } from '../mvp/screen-helpers';

/** `payload.documents` настроек центра — объект целиком: сервер сливает только верхние ключи. */
export const documentSettingsFrom = (payload: unknown): Record<string, unknown> => {
  if (!payload || typeof payload !== 'object') return {};
  const documents = (payload as Record<string, unknown>).documents;
  return documents && typeof documents === 'object'
    ? { ...(documents as Record<string, unknown>) }
    : {};
};

/**
 * Раздел настроек «Выпуск документов» (МГ-F5.1, срез 20.2).
 *
 * «Требовать согласие на обработку ПДн перед выпуском» — решение, которое ТЗ оставило центру;
 * по умолчанию выключено (РМ124): у многих центров согласия собраны на бумаге и ещё не внесены,
 * включённая по умолчанию проверка остановила бы им выпуск. Раздел виден только с правом
 * настроек центра — без него пустая рамка выглядела бы сломанной.
 */
export function DocumentIssueSettingsSection(): ReactElement | null {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const settings = useTenantSettings();
  const saved = documentSettingsFrom(settings.data?.payload).requireConsentBeforeIssue === true;
  const [requireConsent, setRequireConsent] = useState(saved);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRequireConsent(saved);
  }, [saved]);

  const unsavedGuard = useUnsavedForm(
    { requireConsent },
    { saving, initial: { requireConsent: saved } }
  );

  if (!session || !hasPermission(session.permissions, 'tenant.settings.write')) return null;

  const save = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await tenantApi.updateSettings(session, {
        payload: {
          documents: {
            ...documentSettingsFrom(settings.data?.payload),
            requireConsentBeforeIssue: requireConsent
          }
        }
      });
      await queryClient.invalidateQueries({ queryKey: [TENANT_SETTINGS_QUERY_KEY] });
      await queryClient.invalidateQueries({ queryKey: ['issue-readiness'] });
      setNotice(
        requireConsent
          ? 'Сохранено: перед выпуском проверяется согласие на обработку персональных данных.'
          : 'Сохранено: согласие перед выпуском не проверяется.'
      );
    } catch (err) {
      setError(readApiMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard title="Выпуск документов">
      {unsavedGuard}
      {settings.isLoading ? <LoadingState message="Загрузка настроек…" /> : null}
      <label>
        <input
          type="checkbox"
          checked={requireConsent}
          onChange={(e) => setRequireConsent(e.target.checked)}
        />{' '}
        Требовать согласие на обработку персональных данных перед выпуском документов
      </label>
      <p className="ui-hint">
        Включено — слушатель без действующего согласия попадёт в список «Что мешает выпустить
        документы» в карточке группы. Выключено — согласие перед выпуском не проверяется.
      </p>
      {error ? <SectionError message={error} /> : null}
      {notice ? <p role="status">{notice}</p> : null}
      <div className="ui-inline">
        <button
          type="button"
          className={`ui-button ui-button--primary ${saving ? 'ui-button--loading' : ''}`}
          onClick={() => void save()}
          disabled={saving}
        >
          Сохранить настройки выпуска
        </button>
      </div>
    </SectionCard>
  );
}
