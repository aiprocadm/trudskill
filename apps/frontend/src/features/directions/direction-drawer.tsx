'use client';

import { DetailDrawer, DrawerCancelButton, LookupSelect } from '@trudskill/ui';
import { useState } from 'react';

import { directionsApi } from './api';
import { SectionError } from '../../components/state-wrappers';
import { useAuth } from '../auth/context';

import type { DirectionPayload } from './api';
import type { Direction } from '../mvp/types';

interface DirectionForm {
  code: string;
  name: string;
  parentDirectionId: string;
  sortOrder: string;
  note: string;
}

const toForm = (direction?: Direction): DirectionForm => ({
  code: direction?.code ?? '',
  name: direction?.name ?? '',
  parentDirectionId: direction?.parentDirectionId ?? '',
  sortOrder: String(direction?.sortOrder ?? 0),
  note: direction?.note ?? ''
});

/** Кого можно выбрать родителем: действующие, не само направление и не его вложенные. */
export const parentCandidates = (all: readonly Direction[], selfId?: string): Direction[] => {
  if (!selfId) return all.filter((d) => d.status !== 'archived');
  const descendants = new Set<string>([selfId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const d of all) {
      if (d.parentDirectionId && descendants.has(d.parentDirectionId) && !descendants.has(d.id)) {
        descendants.add(d.id);
        grew = true;
      }
    }
  }
  return all.filter((d) => d.status !== 'archived' && !descendants.has(d.id));
};

/**
 * Направление обучения (МГ-E1.1, срез 15.2): код как в CDOPROF («R13»), название, куда
 * вложено и порядок внутри. Проверки (код не повторяется, без петель) делает сервер.
 */
export function DirectionDrawer({
  direction,
  all,
  onClose,
  onSaved
}: {
  direction?: Direction;
  all: readonly Direction[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { session } = useAuth();
  const [form, setForm] = useState<DirectionForm>(() => toForm(direction));
  const [initial] = useState<DirectionForm>(() => toForm(direction));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const set = <K extends keyof DirectionForm>(key: K, value: DirectionForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!session || !form.code.trim() || !form.name.trim()) return;
    setSaving(true);
    setError(null);
    const sortOrder = Number.parseInt(form.sortOrder, 10);
    const payload: DirectionPayload = {
      code: form.code.trim(),
      name: form.name.trim(),
      sortOrder: Number.isFinite(sortOrder) && sortOrder >= 0 ? sortOrder : 0,
      ...(direction
        ? {
            parentDirectionId: form.parentDirectionId || null,
            note: form.note.trim() ? form.note.trim() : null
          }
        : {
            ...(form.parentDirectionId ? { parentDirectionId: form.parentDirectionId } : {}),
            ...(form.note.trim() ? { note: form.note.trim() } : {})
          })
    };
    try {
      const saved = direction
        ? await directionsApi.update(session, direction.id, payload)
        : await directionsApi.create(session, payload);
      onSaved(`Направление «${saved.name}» сохранено.`);
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DetailDrawer
      open
      onClose={onClose}
      title={direction ? `Направление: ${direction.name}` : 'Новое направление'}
      hasUnsavedChanges={JSON.stringify(form) !== JSON.stringify(initial)}
    >
      <form onSubmit={(e) => void submit(e)} className="ui-stack">
        <label className="ui-field">
          <span className="ui-field-label">Код *</span>
          <input
            className="ui-input"
            value={form.code}
            onChange={(e) => set('code', e.target.value)}
            placeholder="Например, ОТ-1"
            required
          />
        </label>
        <label className="ui-field">
          <span className="ui-field-label">Название *</span>
          <input
            className="ui-input"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Например, Охрана труда"
            required
          />
        </label>
        <LookupSelect
          label="Входит в направление"
          value={form.parentDirectionId}
          onChange={(value) => set('parentDirectionId', value)}
          items={[
            { value: '', label: 'верхний уровень' },
            ...parentCandidates(all, direction?.id).map((d) => ({ value: d.id, label: d.name }))
          ]}
        />
        <label className="ui-field">
          <span className="ui-field-label">Порядок в списке</span>
          <input
            className="ui-input"
            type="number"
            inputMode="numeric"
            min={0}
            value={form.sortOrder}
            onChange={(e) => set('sortOrder', e.target.value)}
          />
          <span className="ui-hint">Меньше — выше среди соседних направлений.</span>
        </label>
        <label className="ui-field">
          <span className="ui-field-label">Примечание</span>
          <textarea
            className="ui-textarea"
            rows={3}
            value={form.note}
            onChange={(e) => set('note', e.target.value)}
          />
        </label>
        {error !== null ? <SectionError error={error} /> : null}
        <div className="ui-modal-actions">
          <DrawerCancelButton className="ui-button" disabled={saving} onFallbackClose={onClose} />
          <button
            type="submit"
            className={`ui-button ui-button--primary ${saving ? 'ui-button--loading' : ''}`}
            disabled={saving}
          >
            Сохранить направление
          </button>
        </div>
      </form>
    </DetailDrawer>
  );
}
