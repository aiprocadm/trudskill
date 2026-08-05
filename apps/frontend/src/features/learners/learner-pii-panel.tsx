'use client';

import { useState } from 'react';

import { learnersApi } from './api';
import { ApiClientError } from '../../lib/api/client';
import { useAuth } from '../auth/context';

import type { LearnerErasureReport } from './types';

/**
 * ФТ-G6 (Фаза 4 Task 12): права субъекта персональных данных прямо в карточке слушателя.
 *
 * Панель скрыта целиком без права `learners.pii.manage` — не «показать и запретить»:
 * методисту незачем видеть кнопку, которой он всё равно не воспользуется.
 *
 * Обезличивание требует НАБРАТЬ подтверждение словом, а не нажать «ОК». Операция
 * необратима и обычно выполняется по бумажному заявлению — секунда на «а точно тот
 * слушатель?» здесь дешевле, чем стёртая по ошибке карточка.
 */
export function LearnerPiiPanel({
  learnerId,
  learnerLabel,
  onErased
}: {
  learnerId: string;
  learnerLabel: string;
  onErased: () => void;
}) {
  const { session } = useAuth();
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState<'export' | 'erase' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<LearnerErasureReport | null>(null);

  if (!session?.permissions.includes('learners.pii.manage')) return null;

  const fail = (err: unknown, fallback: string) => {
    setError(err instanceof ApiClientError ? err.message : fallback);
  };

  const handleExport = async () => {
    setBusy('export');
    setError(null);
    try {
      const data = await learnersApi.exportPersonalData(session, learnerId);
      // Файл собирается в браузере из уже полученного ответа: отдельная «ссылка на
      // скачивание» на сервере означала бы адрес с ПДн, который живёт в истории браузера
      // и логах прокси.
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      );
      const link = document.createElement('a');
      link.href = url;
      // Имя файла — по идентификатору, без ФИО.
      link.download = `personal-data-${learnerId}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      fail(err, 'Не удалось выгрузить данные');
    } finally {
      setBusy(null);
    }
  };

  const handleErase = async () => {
    setBusy('erase');
    setError(null);
    try {
      setReport(await learnersApi.erasePersonalData(session, learnerId));
      setConfirm('');
      onErased();
    } catch (err) {
      fail(err, 'Не удалось обезличить данные');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="ui-stack" aria-labelledby="pii-panel-title">
      <h3 id="pii-panel-title" className="ui-field-label">
        Персональные данные (152-ФЗ)
      </h3>

      <button
        type="button"
        className="ui-button"
        onClick={() => void handleExport()}
        disabled={busy !== null}
      >
        {busy === 'export' ? 'Готовим выгрузку…' : 'Выгрузить данные (JSON)'}
      </button>

      <p className="ui-hint">
        Обезличивание необратимо. Удостоверения, протоколы и записи об обучении останутся — закон
        обязывает учебный центр их хранить.
      </p>

      <label className="ui-field">
        <span className="ui-field-label">
          Для подтверждения наберите: <b>обезличить</b>
        </span>
        <input
          className="ui-input"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="обезличить"
          aria-label="Подтверждение обезличивания"
        />
      </label>

      <button
        type="button"
        className="ui-button ui-button--danger"
        onClick={() => void handleErase()}
        disabled={busy !== null || confirm.trim().toLowerCase() !== 'обезличить'}
      >
        {busy === 'erase' ? 'Обезличиваем…' : `Обезличить данные: ${learnerLabel}`}
      </button>

      {error ? (
        <div role="alert" className="ui-error">
          {error}
        </div>
      ) : null}

      {report ? (
        <div role="status" className="ui-stack">
          <p>
            Стёрто полей: {report.erasedFields.length}. Снимков удалено:{' '}
            {report.identityImagesPurged}.
          </p>
          <ul>
            {report.retained.map((item) => (
              <li key={item.what}>
                {item.what} — {item.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
