import { fieldId } from '../../a11y/visually-hidden.js';

import type { ReactElement } from 'react';

/**
 * Поле с подсказками из справочника и свободным вводом (МГ-C1.2, РМ83).
 *
 * Это не выпадающий список: человек печатает, браузер предлагает совпадения из `options`
 * (`<datalist>`), а новое значение остаётся как есть и попадает в справочник при сохранении
 * карточки. Так «должность» не упирается в закрытый список из CDOPROF и не требует
 * отдельного диалога «добавить значение». Подсказки приходят с сервера через `onQueryChange`.
 */
export const ComboInput = ({
  label,
  value,
  onChange,
  options,
  onQueryChange,
  hint,
  placeholder,
  id,
  form,
  inputMode
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Подсказки: строки справочника; совпадения выбирает браузер. */
  options: ReadonlyArray<string>;
  /** Введённый текст уходит наружу — за подсказками к серверу. */
  onQueryChange?: (query: string) => void;
  hint?: string;
  placeholder?: string;
  id?: string;
  /** Для полей вне `<form>` (панель с футером): связь с формой по идентификатору. */
  form?: string;
  inputMode?: 'text' | 'search';
}): ReactElement => {
  const inputId = id ?? fieldId(label, 'input');
  const listId = `${inputId}-options`;
  const hintId = `${inputId}-hint`;
  return (
    <label className="ui-field" htmlFor={inputId}>
      <span className="ui-field-label">{label}</span>
      <input
        id={inputId}
        className="ui-input"
        list={listId}
        value={value}
        autoComplete="off"
        {...(inputMode ? { inputMode } : {})}
        {...(placeholder ? { placeholder } : {})}
        {...(form ? { form } : {})}
        {...(hint ? { 'aria-describedby': hintId } : {})}
        onChange={(event) => {
          onChange(event.target.value);
          onQueryChange?.(event.target.value);
        }}
      />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      {hint ? (
        <span id={hintId} className="ui-field-hint">
          {hint}
        </span>
      ) : null}
    </label>
  );
};
