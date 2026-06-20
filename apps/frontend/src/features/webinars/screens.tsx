'use client';

import { useState } from 'react';

import { useMyWebinars, useProviderSettings, useWebinars } from './hooks';
import { WEBINAR_STATUS_LABELS, type WebinarProviderCode } from './types';
import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../components/state-wrappers';

const PROVIDERS: WebinarProviderCode[] = ['noop', 'fake', 'jitsi', 'pruffme', 'zoom', 'bbb'];

export function WebinarsAdminScreen() {
  const { items, error, create } = useWebinars();
  const [title, setTitle] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

  return (
    <PageContainer>
      <PageHeader title="Вебинары" subtitle="Создание, участники, посещаемость" />
      <SectionCard title="Создать вебинар">
        <div className="ui-inline">
          <input placeholder="Название" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
          <button
            type="button"
            className="ui-button"
            disabled={!title || !start || !end}
            onClick={() =>
              create({
                title,
                plannedStartAt: new Date(start).toISOString(),
                plannedEndAt: new Date(end).toISOString()
              })
            }
          >
            Создать
          </button>
        </div>
      </SectionCard>
      <SectionCard title="Список">
        {error ? <SectionError message={error} /> : null}
        {items.length === 0 && !error ? <SectionEmpty message="Вебинаров пока нет." /> : null}
        {items.map((w) => (
          <div key={w.id} className="ui-list-row">
            <strong>{w.title}</strong>
            <div className="ui-list-row-meta">
              {WEBINAR_STATUS_LABELS[w.status]} ·{' '}
              {new Date(w.plannedStartAt).toLocaleString('ru-RU')}
              {w.providerCode ? ` · ${w.providerCode}` : ' · без провайдера'}
            </div>
          </div>
        ))}
      </SectionCard>
    </PageContainer>
  );
}

export function WebinarProviderSettingsScreen() {
  const { settings, error, saving, save } = useProviderSettings();
  const [code, setCode] = useState<WebinarProviderCode>('noop');
  const [baseUrl, setBaseUrl] = useState('');
  const [enabled, setEnabled] = useState(false);

  return (
    <PageContainer>
      <PageHeader title="Провайдер вебинаров" subtitle="Выбор площадки для этого учебного центра" />
      <SectionCard title="Настройки">
        {error ? <SectionError message={error} /> : null}
        {settings ? (
          <div className="ui-list-row-meta">
            Текущий: {settings.providerCode} · {settings.enabled ? 'включён' : 'выключен'}
          </div>
        ) : null}
        <div className="ui-inline">
          <select value={code} onChange={(e) => setCode(e.target.value as WebinarProviderCode)}>
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <input
            placeholder="Base URL"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
          <label>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />{' '}
            Включён
          </label>
          <button
            type="button"
            className="ui-button"
            disabled={saving}
            onClick={() => save({ providerCode: code, enabled, ...(baseUrl ? { baseUrl } : {}) })}
          >
            Сохранить
          </button>
        </div>
      </SectionCard>
    </PageContainer>
  );
}

export function MyWebinarsScreen() {
  const { items, error } = useMyWebinars();
  return (
    <PageContainer>
      <PageHeader title="Мои вебинары" subtitle="Подключение к занятиям" />
      <SectionCard title="Список">
        {error ? <SectionError message={error} /> : null}
        {items.length === 0 && !error ? <SectionEmpty message="Вебинаров пока нет." /> : null}
        {items.map((w) => (
          <div key={w.id} className="ui-list-row">
            <strong>{w.title}</strong>
            <div className="ui-list-row-meta">
              {WEBINAR_STATUS_LABELS[w.status]} ·{' '}
              {new Date(w.plannedStartAt).toLocaleString('ru-RU')}
            </div>
            {w.joinUrl ? (
              <a className="ui-button" href={w.joinUrl} target="_blank" rel="noreferrer">
                Подключиться
              </a>
            ) : (
              <span className="ui-list-row-meta">Ссылка появится позже</span>
            )}
          </div>
        ))}
      </SectionCard>
    </PageContainer>
  );
}
