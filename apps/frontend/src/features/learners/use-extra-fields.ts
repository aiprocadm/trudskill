'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { type LearnerExtraFieldDef, learnerExtraFieldsFrom } from './extra-fields';
import { tenantApi } from '../../lib/tenant/tenant-api';
import { useAuth } from '../auth/context';

export const TENANT_SETTINGS_QUERY_KEY = 'tenant-settings';

/** Настройки центра одним запросом на экран: описание полей читают и карточка, и панель, и настройки. */
export function useTenantSettings() {
  const { session } = useAuth();
  return useQuery({
    queryKey: [TENANT_SETTINGS_QUERY_KEY, session?.user.tenantId],
    enabled: Boolean(session),
    queryFn: () => tenantApi.settings(session!),
    /* Без права `tenant.read` карточка слушателя всё равно должна открываться — без лишнего тоста. */
    meta: { suppressGlobalErrorToast: true }
  });
}

/** Описание именованных полей центра (МГ-C1.3); пока грузится или прав нет — пусто. */
export function useLearnerExtraFields(): LearnerExtraFieldDef[] {
  const settings = useTenantSettings();
  return learnerExtraFieldsFrom(settings.data?.payload);
}

/** Сохранение описания полей — тот же приём `useState` + `await`, что у остальных настроек. */
export function useSaveLearnerExtraFields() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  return {
    saving,
    save: async (defs: LearnerExtraFieldDef[]): Promise<void> => {
      if (!session) throw new Error('Нет активной сессии');
      setSaving(true);
      try {
        /* Сервер сливает `payload` по ключам: остальные настройки центра не затираются. */
        await tenantApi.updateSettings(session, { payload: { learnerExtraFields: defs } });
        await queryClient.invalidateQueries({ queryKey: [TENANT_SETTINGS_QUERY_KEY] });
      } finally {
        setSaving(false);
      }
    }
  };
}
