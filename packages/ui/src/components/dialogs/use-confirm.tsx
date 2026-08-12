'use client';

import { useCallback, useState } from 'react';

import { Modal } from './index.js';

import type { ReactElement } from 'react';

export interface ConfirmRequest {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  /**
   * Необязательное поле ввода — заменяет `window.prompt` (CMP-006).
   * Значение приходит первым аргументом в действие.
   */
  input?: { label: string; placeholder?: string; required?: boolean };
}

/**
 * Подтверждение опасного действия одной строкой на месте вызова (CMP-006).
 *
 * `window.confirm()` и `window.prompt()` блокируют поток, не переводятся, не стилизуются
 * и не проходят проверку на 360px. Но заменять их вручную на каждом экране значит писать
 * одно и то же состояние семь раз — поэтому механика живёт здесь:
 *
 *     const { ask, dialog } = useConfirmDialog();
 *     ...
 *     ask({ title: 'Отозвать лицензию', tone: 'danger' }, () => revokeLicense(id));
 *     ...
 *     return (<>{экран}{dialog}</>);
 */
export const useConfirmDialog = (): {
  ask: (request: ConfirmRequest, action: (inputValue?: string) => void) => void;
  dialog: ReactElement | null;
} => {
  const [pending, setPending] = useState<{
    request: ConfirmRequest;
    action: (inputValue?: string) => void;
  } | null>(null);
  const [value, setValue] = useState('');

  const ask = useCallback((request: ConfirmRequest, action: (inputValue?: string) => void) => {
    setValue('');
    setPending({ request, action });
  }, []);

  const close = () => setPending(null);

  const dialog = pending ? (
    <Modal open title={pending.request.title} onClose={close}>
      {pending.request.message ? (
        <p className="ui-system-text" style={{ textAlign: 'left', marginBottom: 0 }}>
          {pending.request.message}
        </p>
      ) : null}
      {pending.request.input ? (
        <label className="ui-field">
          <span className="ui-field-label">{pending.request.input.label}</span>
          <input
            className="ui-input"
            value={value}
            placeholder={pending.request.input.placeholder ?? ''}
            onChange={(event) => setValue(event.target.value)}
          />
        </label>
      ) : null}
      <div className="ui-modal-actions">
        <button type="button" className="ui-button" onClick={close}>
          {pending.request.cancelLabel ?? 'Отмена'}
        </button>
        <button
          type="button"
          className={
            pending.request.tone === 'danger'
              ? 'ui-button ui-button-danger'
              : 'ui-button ui-button--primary'
          }
          disabled={pending.request.input?.required === true && value.trim() === ''}
          onClick={() => {
            const trimmed = value.trim();
            pending.action(trimmed === '' ? undefined : trimmed);
            close();
          }}
        >
          {pending.request.confirmLabel ?? 'Подтвердить'}
        </button>
      </div>
    </Modal>
  ) : null;

  return { ask, dialog };
};
