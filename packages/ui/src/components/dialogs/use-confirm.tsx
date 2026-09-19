'use client';

import { useCallback, useState } from 'react';

import { Modal } from './index.js';
import { useImpersonationNote } from '../../providers/impersonation-context.js';

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
  /**
   * Подтверждение вводом — для НЕОБРАТИМЫХ действий (`CMP-005`).
   *
   * Опасное действие отличается от обычного цветом кнопки, но цвет не останавливает руку:
   * человек нажимает «Отозвать» в списке из двадцати строк, промахнувшись на одну. Там, где
   * отменить нельзя, нужен второй, осознанный шаг — переписать то, с чем работаешь.
   *
   * `word` — то, что человек должен ввести. Просить надо НЕ слово-заклинание вроде
   * «УДАЛИТЬ», а признак самой записи: номер лицензии, номер заказа. Тогда ввод подтверждает
   * не только намерение, но и что запись выбрана верно.
   */
  requireTyping?: { word: string; label: string; hint?: string };
}

/**
 * Можно ли сейчас нажать кнопку подтверждения.
 *
 * Вынесено из разметки отдельной функцией, чтобы правило проверялось тестом: в пакете нет
 * средства монтировать компоненты (RISK-002), а именно здесь живёт защита необратимого
 * действия — ошибка тут молча вернула бы подтверждение одним нажатием.
 */
export const confirmBlocked = (
  request: Pick<ConfirmRequest, 'input' | 'requireTyping'>,
  entered: { value: string; typed: string }
): boolean => {
  if (request.input?.required === true && entered.value.trim() === '') return true;
  if (!request.requireTyping) return false;
  /*
   * Сравнение без учёта регистра и краевых пробелов: смысл ввода — осознанность, а не
   * точность набора. Номер лицензии «л035-001» и «Л035-001» — один и тот же номер.
   */
  return entered.typed.trim().toLowerCase() !== request.requireTyping.word.trim().toLowerCase();
};

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
  /*
   * ТЗ 13.5: работа «от имени» помечается в КАЖДОМ подтверждении, а не в тех, где о ней
   * вспомнили. Признак приходит контекстом от оболочки приложения: свойство пришлось бы
   * передавать в десяток вызовов, и первый же новый экран забыл бы про него молча —
   * подтверждение выглядело бы обычным, а действие ушло бы от чужого имени (журнал 551).
   */
  const impersonationNote = useImpersonationNote();
  const [pending, setPending] = useState<{
    request: ConfirmRequest;
    action: (inputValue?: string) => void;
  } | null>(null);
  const [value, setValue] = useState('');
  const [typed, setTyped] = useState('');

  const ask = useCallback((request: ConfirmRequest, action: (inputValue?: string) => void) => {
    setValue('');
    setTyped('');
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
      {impersonationNote ? (
        <p className="ui-hint ui-hint--blocked" role="note">
          {impersonationNote}
        </p>
      ) : null}
      {pending.request.requireTyping ? (
        <label className="ui-field">
          <span className="ui-field-label">{pending.request.requireTyping.label}</span>
          <input
            className="ui-input"
            value={typed}
            /* Автоподстановка и автозамена подорвали бы смысл: человек должен ввести сам. */
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            onChange={(event) => setTyped(event.target.value)}
          />
          {pending.request.requireTyping.hint ? (
            <span className="ui-field-hint">{pending.request.requireTyping.hint}</span>
          ) : null}
        </label>
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
          disabled={confirmBlocked(pending.request, { value, typed })}
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
