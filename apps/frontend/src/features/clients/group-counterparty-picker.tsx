'use client';

import { useClientsList, useSetGroupCounterparty } from './hooks';

/**
 * Phase 2 Plan C — picker для назначения компании-заказчика на группу.
 *
 * **DEVIATION D4**: standalone компонент, ещё не интегрированный в
 * `GroupDetailsScreen` (`apps/frontend/src/features/mvp/screens.tsx:1515`).
 * Причина: тот файл — mega-screen ~2000 строк с множеством domain'ов;
 * вставка inline-select повышает риск побочных регрессий. API endpoint
 * `PATCH /groups/:id/counterparty` уже доступен и протестирован
 * (см. `clients/api.contract.test.ts` Task 8 + backend HTTP integration Task 6).
 *
 * **TODO V1.1**: интегрировать picker в `GroupDetailsScreen` секцию
 * «Связи группы» — extract section + drop-in этот компонент.
 *
 * Компонент тестабелен в изоляции; импортируется в `GroupDetailsScreen`
 * по готовности.
 */
interface GroupCounterpartyPickerProps {
  groupId: string;
  currentCounterpartyId?: string;
  onChanged?: () => void;
}

export function GroupCounterpartyPicker({
  groupId,
  currentCounterpartyId,
  onChanged
}: GroupCounterpartyPickerProps) {
  const list = useClientsList({ pageSize: 1000 });
  const mutation = useSetGroupCounterparty();

  const handleChange = async (next: string) => {
    const counterpartyId = next === '' ? null : next;
    const ok = await mutation.mutate(groupId, counterpartyId);
    if (ok) onChanged?.();
  };

  return (
    <div className="ui-field">
      <span className="ui-field-label">Компания-заказчик</span>
      <select
        className="ui-select"
        value={currentCounterpartyId ?? ''}
        onChange={(e) => void handleChange(e.target.value)}
        disabled={mutation.isPending || list.isLoading}
        aria-label="Компания-заказчик"
      >
        <option value="">— не привязана —</option>
        {list.data?.items.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      {mutation.error ? (
        <div role="alert" className="ui-error">
          {mutation.error}
        </div>
      ) : null}
    </div>
  );
}
