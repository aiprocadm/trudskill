'use client';

import { DirectorySelect } from '@trudskill/ui';
import { useState } from 'react';

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
  const [query, setQuery] = useState('');
  /*
   * Двести — настоящий потолок запроса с проволоки (журнал 277). Здесь стояла тысяча:
   * число, которого не будет, — сервер молча отдавал бы двести. Остальное добирается
   * поиском на сервере, и список честно говорит, сколько показано из скольких (журнал 392).
   */
  const list = useClientsList({
    pageSize: 200,
    ...(query.trim() ? { q: query.trim() } : {})
  });
  const mutation = useSetGroupCounterparty();

  const handleChange = async (next: string) => {
    const counterpartyId = next === '' ? null : next;
    const ok = await mutation.mutate(groupId, counterpartyId);
    if (ok) onChanged?.();
  };

  return (
    <div className="ui-field">
      <DirectorySelect
        label="Компания-заказчик"
        value={currentCounterpartyId ?? ''}
        onChange={(next) => void handleChange(next)}
        options={(list.data?.items ?? []).map((c) => ({ value: c.id, label: c.name }))}
        {...(list.data ? { total: list.data.total } : {})}
        query={query}
        onQueryChange={setQuery}
        isLoading={mutation.isPending || list.isLoading}
        emptyLabel="— не привязана —"
        emptyHint="Компаний пока нет — заведите компанию в разделе «Компании»."
        searchLabel="Поиск компании"
        searchPlaceholder="Название компании"
      />
      {mutation.error ? (
        <div role="alert" className="ui-error">
          {mutation.error}
        </div>
      ) : null}
    </div>
  );
}
