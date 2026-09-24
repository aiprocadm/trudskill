'use client';

import { ListPage, LookupSelect } from '@trudskill/ui';
import { useState } from 'react';

import { directionsApi } from './api';
import { DirectionDrawer } from './direction-drawer';
import { PageContainer, PageHeader, SectionError } from '../../components/state-wrappers';
import { hasPermission } from '../../lib/rbac/permissions';
import { useAuth } from '../auth/context';
import { useDirectionsList } from '../mvp/hooks';

import type { Direction } from '../mvp/types';

type StatusFilter = 'active' | 'archived' | '';

const STATUS_LABEL: Record<string, string> = { active: 'действует', archived: 'в архиве' };

/*
 * TPL-001 (Фаза 4, срез 17): реестр направлений. МГ-E1.1 (срез 15.2): дерево как в CDOPROF —
 * создание, правка, вложенность («Входит в»), порядок, архив и возврат. Удаления нет:
 * курсы архивного направления остаются.
 */
export const DirectionsPageScreen = () => {
  const { session } = useAuth();
  const canWrite = hasPermission(session?.permissions ?? [], 'directions.write');
  const [status, setStatus] = useState<StatusFilter>('active');
  const list = useDirectionsList({
    page: 1,
    page_size: 200,
    sort: 'name:asc',
    ...(status ? { status } : {})
  });
  /* Все направления — для подписи «Входит в» и выбора родителя в форме. */
  const all = useDirectionsList({ page: 1, page_size: 200, sort: 'name:asc' });
  const allItems = all.data?.items ?? [];
  const nameById = new Map(allItems.map((d) => [d.id, d.name]));
  const [drawer, setDrawer] = useState<Direction | 'new' | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = async () => {
    await Promise.all([list.refetch(), all.refetch()]);
  };

  const setDirectionStatus = (row: Direction, next: 'active' | 'archived') => {
    if (!session) return;
    setBusy(true);
    setActionError(null);
    setNotice(null);
    directionsApi
      .update(session, row.id, { status: next })
      .then(async () => {
        await refresh();
        setNotice(
          next === 'archived'
            ? `Направление «${row.name}» — в архиве. Его курсы остались на месте.`
            : `Направление «${row.name}» снова действует.`
        );
      })
      .catch((err: unknown) => setActionError(err))
      .finally(() => setBusy(false));
  };

  const rowActions = (row: Direction & { parent: string }) =>
    canWrite
      ? [
          { label: 'Изменить направление', disabled: busy, onSelect: () => setDrawer(row) },
          row.status === 'archived'
            ? {
                label: 'Вернуть из архива',
                disabled: busy,
                onSelect: () => setDirectionStatus(row, 'active')
              }
            : {
                label: 'Отправить в архив',
                disabled: busy,
                onSelect: () => setDirectionStatus(row, 'archived')
              }
        ]
      : [];

  return (
    <PageContainer>
      <PageHeader
        title="Направления обучения"
        subtitle="Группировка курсов по областям: охрана труда, пожарная безопасность, медицина"
        {...(canWrite
          ? { primaryAction: { label: 'Добавить направление', onSelect: () => setDrawer('new') } }
          : {})}
      />
      {actionError !== null ? <SectionError error={actionError} /> : null}
      {notice ? (
        <p className="ui-callout" role="status">
          {notice}
        </p>
      ) : null}
      <ListPage<Direction & { parent: string; codeView: string; order: string; state: string }>
        filters={
          <LookupSelect
            label="Статус"
            value={status}
            onChange={(value) => setStatus(value as StatusFilter)}
            items={[
              { value: 'active', label: 'действующие' },
              { value: 'archived', label: 'в архиве' },
              { value: '', label: 'все' }
            ]}
          />
        }
        columns={[
          { key: 'name', title: 'Направление' },
          { key: 'codeView', title: 'Код' },
          { key: 'parent', title: 'Входит в' },
          { key: 'order', title: 'Порядок' },
          { key: 'state', title: 'Статус' }
        ]}
        rows={(list.data?.items ?? []).map((item) => ({
          ...item,
          codeView: item.code || '—',
          parent: item.parentDirectionId
            ? (nameById.get(item.parentDirectionId) ?? 'нет в списке направлений')
            : 'верхний уровень',
          order: String(item.sortOrder ?? 0),
          state: STATUS_LABEL[item.status] ?? item.status
        }))}
        rowActions={rowActions}
        isLoading={list.loading}
        error={list.error ? new Error(list.error) : undefined}
        onRetry={() => void list.refetch()}
        rowKey={(row) => row.id}
        emptyMessage={
          status === 'archived' ? 'В архиве направлений нет' : 'Здесь появятся направления обучения'
        }
        emptyHint="Направление объединяет курсы одной области — по нему удобно отбирать курсы и отчитываться перед регулятором."
      />
      {drawer ? (
        <DirectionDrawer
          {...(drawer === 'new' ? {} : { direction: drawer })}
          all={allItems}
          onClose={() => setDrawer(null)}
          onSaved={(message) => {
            setDrawer(null);
            setNotice(message);
            void refresh();
          }}
        />
      ) : null}
    </PageContainer>
  );
};
