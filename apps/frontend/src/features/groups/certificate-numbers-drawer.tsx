'use client';

import {
  BlockedHint,
  type BulkOutcome,
  DataTable,
  DetailDrawer,
  DrawerCancelButton,
  OperationOutcome,
  blockedProps
} from '@trudskill/ui';
import { useState } from 'react';

import {
  type CertificateNumberRow,
  certificateNumbersApi,
  protocolOrder,
  sequenceFrom,
  toBulkOutcome
} from './certificate-numbers';
import { SectionError } from '../../components/state-wrappers';
import { useAuth } from '../auth/context';

export interface CertificateNumbersLearner {
  enrollmentId: string;
  name: string;
  number?: string | undefined;
  series?: string | undefined;
  rank?: string | undefined;
}

type EditorRow = CertificateNumberRow & { name: string };

const FILL_KEY = 'certificate-numbers-fill';

/**
 * «Номера удостоверений» группы (МГ-F3.2, срез 20.3b) — аналог «Расстановки номеров» CDOPROF.
 *
 * Номер, серия и разряд назначаются до выпуска: «Заполнить по порядку» проставляет номера от
 * начального в порядке строк протокола, дальше любую строку можно поправить руками. Сервер
 * принимает годные строки и называет отказы поимённо (уже выпущенное удостоверение, занятый
 * номер) — одна плохая строка не отменяет остальные.
 */
export function CertificateNumbersDrawer({
  groupId,
  learners,
  onClose,
  onSaved
}: {
  groupId: string;
  learners: readonly CertificateNumbersLearner[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const { session } = useAuth();
  const [initial] = useState<EditorRow[]>(() =>
    protocolOrder(learners).map((l) => ({
      enrollmentId: l.enrollmentId,
      name: l.name,
      number: l.number ?? '',
      series: l.series ?? '',
      rank: l.rank ?? ''
    }))
  );
  const [rows, setRows] = useState<EditorRow[]>(initial);
  const [start, setStart] = useState('');
  const [series, setSeries] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [outcome, setOutcome] = useState<BulkOutcome | null>(null);

  const setCell = (enrollmentId: string, key: 'number' | 'series' | 'rank', value: string) =>
    setRows((prev) =>
      prev.map((r) => (r.enrollmentId === enrollmentId ? { ...r, [key]: value } : r))
    );

  const sequence = start.trim() ? sequenceFrom(start, rows.length) : [];
  const fillBlocked = !start.trim()
    ? 'Укажите начальный номер'
    : sequence.length === 0
      ? 'Начальный номер должен оканчиваться цифрами — их система и будет увеличивать'
      : undefined;

  const fill = () => {
    setRows((prev) =>
      prev.map((row, i) => ({
        ...row,
        number: sequence[i] ?? row.number,
        ...(series.trim() ? { series: series.trim() } : {})
      }))
    );
  };

  const save = async () => {
    if (!session) return;
    setSaving(true);
    setError(null);
    setOutcome(null);
    try {
      const result = await certificateNumbersApi.assign(session, groupId, rows);
      const names = new Map(rows.map((r) => [r.enrollmentId, r.name]));
      setOutcome(toBulkOutcome(result, (id) => names.get(id) ?? 'слушатель не найден'));
      await onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DetailDrawer
      open
      width="lg"
      onClose={onClose}
      title="Номера удостоверений"
      hasUnsavedChanges={outcome === null && JSON.stringify(rows) !== JSON.stringify(initial)}
    >
      <div className="ui-stack">
        <p className="ui-hint">
          Номер, серия и разряд назначаются до выпуска и печатаются в удостоверении. Строки идут в
          порядке протокола. Выпущенное удостоверение здесь не меняется — только перевыпуском.
        </p>
        <div className="ui-inline">
          <label className="ui-field">
            <span className="ui-field-label">Начальный номер</span>
            <input
              className="ui-input"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              placeholder="Например, 264501-1"
            />
          </label>
          <label className="ui-field">
            <span className="ui-field-label">Серия для всех</span>
            <input
              className="ui-input"
              value={series}
              onChange={(e) => setSeries(e.target.value)}
              placeholder="Необязательно"
            />
          </label>
          <button
            type="button"
            className="ui-button"
            onClick={fill}
            {...blockedProps(FILL_KEY, fillBlocked)}
          >
            Заполнить по порядку
          </button>
        </div>
        <BlockedHint hintKey={FILL_KEY} reason={fillBlocked} />
        <DataTable<EditorRow>
          columns={[
            { key: 'name', title: 'Слушатель' },
            {
              key: 'number',
              title: 'Номер',
              render: (row) => (
                <input
                  className="ui-input"
                  aria-label={`Номер удостоверения: ${row.name}`}
                  value={row.number}
                  onChange={(e) => setCell(row.enrollmentId, 'number', e.target.value)}
                />
              )
            },
            {
              key: 'series',
              title: 'Серия',
              render: (row) => (
                <input
                  className="ui-input"
                  aria-label={`Серия удостоверения: ${row.name}`}
                  value={row.series}
                  onChange={(e) => setCell(row.enrollmentId, 'series', e.target.value)}
                />
              )
            },
            {
              key: 'rank',
              title: 'Разряд',
              render: (row) => (
                <input
                  className="ui-input"
                  aria-label={`Разряд: ${row.name}`}
                  value={row.rank}
                  onChange={(e) => setCell(row.enrollmentId, 'rank', e.target.value)}
                />
              )
            }
          ]}
          rows={rows}
          rowKey={(row) => row.enrollmentId}
        />
        {outcome ? (
          <OperationOutcome
            outcome={outcome}
            successVerb="Сохранено"
            failuresTitle="Не сохранено:"
          />
        ) : null}
        {error !== null ? <SectionError error={error} /> : null}
        <div className="ui-modal-actions">
          <DrawerCancelButton className="ui-button" disabled={saving} onFallbackClose={onClose} />
          <button
            type="button"
            className={`ui-button ui-button--primary ${saving ? 'ui-button--loading' : ''}`}
            onClick={() => void save()}
            disabled={saving}
          >
            Сохранить номера удостоверений
          </button>
        </div>
      </div>
    </DetailDrawer>
  );
}
