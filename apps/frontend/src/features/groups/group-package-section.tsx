'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  BlockedHint,
  type BulkOutcome,
  DataTable,
  DetailDrawer,
  DrawerCancelButton,
  LoadingState,
  OperationOutcome,
  blockedProps
} from '@trudskill/ui';
import { useState } from 'react';

import {
  PACKAGE_STATE_LABELS,
  type PackageKindRow,
  defaultKinds,
  groupPackageApi,
  issuedView,
  toPackageOutcome,
  useGroupPackage
} from './group-package';
import { SectionCard, SectionEmpty, SectionError } from '../../components/state-wrappers';
import { hasPermission } from '../../lib/rbac/permissions';
import { useAuth } from '../auth/context';

const HINT_KEY = 'group-package-kinds';

/**
 * «Пакет документов» группы (МГ-F2.1, срез 21.2): что группа должна получить по наборам
 * документов своих курсов и что уже выпущено; «Сформировать пакет» — мастер с датами приказа
 * и протокола. Выпуск идёт одним путём (§5.623): проверка центра, неготовые слушатели не
 * попадают в пакет и называются поимённо, повтор не выдаёт вторых номеров.
 */
export function GroupPackageSection({
  groupId,
  onIssued
}: {
  groupId: string;
  onIssued?: () => void | Promise<void>;
}) {
  const { session } = useAuth();
  const canIssue = hasPermission(session?.permissions ?? [], 'documents.generate');
  const query = useGroupPackage(groupId);
  const [open, setOpen] = useState(false);
  const rows = query.data?.kinds ?? [];

  return (
    <SectionCard
      title="Пакет документов"
      actions={
        canIssue && rows.length > 0 ? (
          <button type="button" className="ui-button" onClick={() => setOpen(true)}>
            Сформировать пакет
          </button>
        ) : undefined
      }
    >
      {query.isLoading ? <LoadingState message="Собираем пакет документов…" /> : null}
      {query.error ? <SectionError error={query.error} /> : null}
      {query.data && rows.length === 0 ? (
        <SectionEmpty
          message="У курсов группы не настроены документы"
          hint="Пакет собирается из «Документов по окончании курса» в карточке курса: добавьте туда приказ, протокол и удостоверение."
        />
      ) : null}
      {rows.length > 0 ? (
        <DataTable<PackageKindRow>
          columns={[
            { key: 'title', title: 'Документ' },
            {
              key: 'scope',
              title: 'Кому',
              render: (row) => (row.scope === 'group' ? 'группе' : 'каждому слушателю')
            },
            { key: 'issued', title: 'Выпущено', render: (row) => issuedView(row) },
            { key: 'state', title: 'Статус', render: (row) => PACKAGE_STATE_LABELS[row.state] }
          ]}
          rows={rows}
          rowKey={(row) => row.key}
        />
      ) : null}
      {open ? (
        <GroupPackageDrawer
          groupId={groupId}
          rows={rows}
          onClose={() => setOpen(false)}
          onIssued={async () => {
            await query.refetch();
            await onIssued?.();
          }}
        />
      ) : null}
    </SectionCard>
  );
}

function GroupPackageDrawer({
  groupId,
  rows,
  onClose,
  onIssued
}: {
  groupId: string;
  rows: readonly PackageKindRow[];
  onClose: () => void;
  onIssued: () => void | Promise<void>;
}) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [initialKinds] = useState(() => defaultKinds(rows));
  const [kinds, setKinds] = useState<string[]>(initialKinds);
  const [orderDate, setOrderDate] = useState('');
  const [protocolDate, setProtocolDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [outcome, setOutcome] = useState<BulkOutcome | null>(null);

  const toggle = (key: string) =>
    setKinds((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  const blockedReason = kinds.length ? undefined : 'Отметьте хотя бы один документ';

  const issue = async () => {
    if (!session || !kinds.length) return;
    setBusy(true);
    setError(null);
    try {
      const result = await groupPackageApi.issuePackage(session, groupId, {
        kinds,
        ...(orderDate ? { orderDate } : {}),
        ...(protocolDate ? { protocolDate } : {})
      });
      setOutcome(toPackageOutcome(result));
      await queryClient.invalidateQueries({ queryKey: ['issue-readiness'] });
      await onIssued();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <DetailDrawer
      open
      onClose={onClose}
      title="Сформировать пакет"
      hasUnsavedChanges={
        outcome === null &&
        (Boolean(orderDate) || Boolean(protocolDate) || kinds.join() !== initialKinds.join())
      }
    >
      <div className="ui-stack">
        <p className="ui-hint">
          Документы выпускаются по порядку: приказы, протокол, документы слушателей. Слушатели, у
          которых что-то не готово, в пакет не попадут — их назовём поимённо. Повторное формирование
          не выдаёт вторых номеров: готовое остаётся, упавшее выпускается заново.
        </p>
        <div className="ui-inline">
          <label className="ui-field">
            <span className="ui-field-label">Дата приказа</span>
            <input
              className="ui-input"
              type="date"
              value={orderDate}
              onChange={(e) => setOrderDate(e.target.value)}
            />
          </label>
          <label className="ui-field">
            <span className="ui-field-label">Дата протокола</span>
            <input
              className="ui-input"
              type="date"
              value={protocolDate}
              onChange={(e) => setProtocolDate(e.target.value)}
            />
          </label>
        </div>
        <span className="ui-hint">Не указали дату — документ получит дату дня выпуска.</span>
        <fieldset className="ui-stack">
          <legend className="ui-field-label">Что выпустить</legend>
          {rows.map((row) => (
            <label key={row.key}>
              <input
                type="checkbox"
                checked={kinds.includes(row.key)}
                onChange={() => toggle(row.key)}
              />{' '}
              {row.title} — {PACKAGE_STATE_LABELS[row.state].toLowerCase()}
            </label>
          ))}
        </fieldset>
        {outcome ? (
          <OperationOutcome
            outcome={outcome}
            successVerb="В пакете слушателей"
            failuresTitle="Не попали в пакет:"
          >
            <p className="ui-hint">
              Исправьте названное в карточках слушателей и сформируйте пакет ещё раз — выпустятся
              только недостающие документы.
            </p>
          </OperationOutcome>
        ) : null}
        {error !== null ? <SectionError error={error} /> : null}
        <div className="ui-modal-actions">
          <DrawerCancelButton className="ui-button" disabled={busy} onFallbackClose={onClose} />
          <button
            type="button"
            className={`ui-button ui-button--primary ${busy ? 'ui-button--loading' : ''}`}
            onClick={() => void issue()}
            disabled={busy}
            {...blockedProps(HINT_KEY, blockedReason)}
          >
            Сформировать пакет
          </button>
        </div>
        <BlockedHint hintKey={HINT_KEY} reason={blockedReason} />
      </div>
    </DetailDrawer>
  );
}
