'use client';

import { useState } from 'react';

import { joinWebinar } from './api';
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
            className="ui-button ui-button--primary"
            disabled={!title || !start || !end}
            onClick={() =>
              create({
                title,
                plannedStartAt: new Date(start).toISOString(),
                plannedEndAt: new Date(end).toISOString()
              })
            }
          >
            Создать вебинар
          </button>
        </div>
      </SectionCard>
      <SectionCard title="Список">
        {error ? <SectionError message={error} /> : null}
        {items.length === 0 && !error ? (
          <SectionEmpty
            message="Вебинаров пока нет."
            hint="Вебинар — онлайн-занятие с ссылкой на эфир и отметкой посещения."
          />
        ) : null}
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

/*
 * IA-018: тело настроек — секция для общего экрана «Настройки».
 * Экран-обёртка сохранён (его проверяет сторож webinars.e2e).
 */
export function WebinarProviderSettingsSection() {
  const { settings, error, saving, save } = useProviderSettings();
  const [code, setCode] = useState<WebinarProviderCode>('noop');
  const [baseUrl, setBaseUrl] = useState('');
  const [enabled, setEnabled] = useState(false);

  return (
    <SectionCard title="Провайдер вебинаров">
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
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />{' '}
          Включён
        </label>
        <button
          type="button"
          className="ui-button ui-button--primary"
          disabled={saving}
          onClick={() => save({ providerCode: code, enabled, ...(baseUrl ? { baseUrl } : {}) })}
        >
          Сохранить настройки провайдера
        </button>
      </div>
    </SectionCard>
  );
}

export function WebinarProviderSettingsScreen() {
  return (
    <PageContainer>
      <PageHeader title="Провайдер вебинаров" subtitle="Выбор площадки для этого учебного центра" />
      <WebinarProviderSettingsSection />
    </PageContainer>
  );
}

export function MyWebinarsScreen() {
  const { items, error } = useMyWebinars();
  // ФТ-F4 (Фаза 5 Task 9): посещение фиксируется ДО открытия комнаты — иначе
  // закрытая вкладка съедала бы факт посещения, а с ним и часы в журнале группы.
  const [joined, setJoined] = useState<Record<string, boolean>>({});
  const [joinError, setJoinError] = useState<string | null>(null);

  const connect = async (id: string) => {
    setJoinError(null);
    try {
      const result = await joinWebinar(id);
      setJoined((prev) => ({ ...prev, [id]: true }));
      if (result.joinUrl) window.open(result.joinUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Не удалось отметить посещение');
    }
  };

  return (
    <PageContainer>
      <PageHeader title="Мои вебинары" subtitle="Подключение к занятиям" />
      <SectionCard title="Список">
        {error ? <SectionError message={error} /> : null}
        {joinError ? <SectionError message={joinError} /> : null}
        {items.length === 0 && !error ? (
          <SectionEmpty
            message="Вебинаров пока нет."
            hint="Вебинар — онлайн-занятие с ссылкой на эфир и отметкой посещения."
          />
        ) : null}
        {items.map((w) => (
          <div key={w.id} className="ui-list-row">
            <strong>{w.title}</strong>
            <div className="ui-list-row-meta">
              {WEBINAR_STATUS_LABELS[w.status]} ·{' '}
              {new Date(w.plannedStartAt).toLocaleString('ru-RU')}
              {joined[w.id] ? ' · посещение отмечено' : ''}
            </div>
            {w.joinUrl ? (
              <button
                type="button"
                className="ui-button ui-button--primary"
                onClick={() => void connect(w.id)}
              >
                Подключиться
              </button>
            ) : (
              <span className="ui-list-row-meta">Ссылка появится позже</span>
            )}
          </div>
        ))}
      </SectionCard>
    </PageContainer>
  );
}
