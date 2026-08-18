import type { ReactElement } from 'react';

/*
 * Выбор файла — одна компонента на всё приложение.
 *
 * Нативный `<input type="file">` рисует браузерную надпись «Choose File / No file chosen»,
 * которая не переводится: в русском интерфейсе жили девять английских кнопок (запись 107
 * журнала). Здесь настоящий input визуально скрыт (но остаётся в фокусном порядке —
 * клавиатура и скринридер работают с ним), а глазами человек видит обычную кнопку
 * пакета и имя выбранного файла по-русски.
 *
 * `fileName` управляет строкой рядом с кнопкой:
 * - не передан — строка не показывается (экраны, где выбор сразу запускает загрузку);
 * - `null` — «Файл не выбран»; строка — имя выбранного файла.
 */
export const FilePicker = ({
  ariaLabel,
  onSelect,
  accept,
  disabled,
  buttonLabel = 'Выбрать файл',
  fileName,
  resetAfterSelect
}: {
  /** Что за файл ждём — подпись для скринридера у настоящего поля. */
  ariaLabel: string;
  onSelect: (file: File | null) => void;
  accept?: string;
  disabled?: boolean;
  buttonLabel?: string;
  fileName?: string | null;
  /** Сбросить значение после выбора — чтобы тот же файл можно было выбрать повторно. */
  resetAfterSelect?: boolean;
}): ReactElement => (
  <label className="ui-file-picker">
    <input
      type="file"
      className="ui-file-picker__input"
      aria-label={ariaLabel}
      {...(accept ? { accept } : {})}
      {...(disabled ? { disabled: true } : {})}
      onChange={(event) => {
        onSelect(event.target.files?.[0] ?? null);
        if (resetAfterSelect) event.target.value = '';
      }}
    />
    <span className="ui-button ui-file-picker__button" aria-hidden>
      {buttonLabel}
    </span>
    {fileName !== undefined ? (
      <span className="ui-file-picker__name">{fileName ?? 'Файл не выбран'}</span>
    ) : null}
  </label>
);
