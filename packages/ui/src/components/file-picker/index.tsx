import type { DragEvent, ReactElement } from 'react';

/*
 * Выбор файла — одна компонента на всё приложение.
 *
 * Нативный `<input type="file">` рисует браузерную надпись «Choose File / No file chosen»,
 * которая не переводится: в русском интерфейсе жили девять английских кнопок (запись 107
 * журнала). Здесь настоящий input визуально скрыт (но остаётся в фокусном порядке —
 * клавиатура и скринридер работают с ним), а глазами человек видит обычную кнопку
 * пакета и имя выбранного файла по-русски.
 *
 * ТЗ 5.9 (Э9). Кнопки было мало: ни перетаскивания, ни съёмки с камеры, ни превью, ни слова
 * о том, какой файл вообще примут и сколько он может весить. Слушатель на телефоне делал
 * селфи, выбирал его «как файл» и узнавал об отказе только после отправки (журнал 469).
 * Теперь всё это есть, и всё — необязательное: там, где выбор файла стоит в ячейке таблицы,
 * компонент выглядит ровно как раньше.
 */

/** Человеческое имя формата по строке `accept`. */
const FORMAT_NAMES: Record<string, string> = {
  'image/png': 'PNG',
  'image/jpeg': 'JPG',
  'image/*': 'изображение',
  'application/pdf': 'PDF',
  'application/zip': 'ZIP',
  'text/csv': 'CSV',
  '.xlsx': 'XLSX',
  '.xls': 'XLS',
  '.csv': 'CSV',
  '.zip': 'ZIP',
  '.pdf': 'PDF'
};

const formatNames = (accept: string): string[] => [
  ...new Set(
    accept
      .split(',')
      .map((one) => one.trim())
      .filter(Boolean)
      .map((one) => FORMAT_NAMES[one] ?? one.replace(/^\./, '').toUpperCase())
  )
];

/**
 * Требования к файлу словами: «JPG или PNG, до 10 МБ».
 *
 * Человек должен знать их ДО выбора, а не после отказа: перевыбрать файл с телефона —
 * это заново открыть камеру или галерею.
 */
export const fileRequirementsText = (accept?: string, maxSizeMb?: number): string | undefined => {
  const names = accept ? formatNames(accept) : [];
  const formats =
    names.length === 0
      ? ''
      : names.length === 1
        ? names[0]!
        : `${names.slice(0, -1).join(', ')} или ${names[names.length - 1]}`;
  const size = maxSizeMb === undefined ? '' : `до ${maxSizeMb} МБ`;
  const parts = [formats, size].filter(Boolean);
  return parts.length === 0 ? undefined : parts.join(', ');
};

/** Подходит ли файл. Возвращает причину отказа человеческим языком либо `undefined`. */
export const fileRejectionReason = (
  file: { name: string; type: string; size: number },
  limits: { accept?: string; maxSizeMb?: number }
): string | undefined => {
  if (limits.accept) {
    const allowed = limits.accept
      .split(',')
      .map((one) => one.trim().toLowerCase())
      .filter(Boolean);
    const type = file.type.toLowerCase();
    const extension = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`;
    const fits = allowed.some((one) =>
      one.startsWith('.')
        ? one === extension
        : one.endsWith('/*')
          ? type.startsWith(one.slice(0, -1))
          : one === type
    );
    if (!fits) {
      return `Такой файл не подойдёт. Нужен ${fileRequirementsText(limits.accept) ?? 'другой формат'}.`;
    }
  }
  if (limits.maxSizeMb !== undefined && file.size > limits.maxSizeMb * 1024 * 1024) {
    const mb = (file.size / (1024 * 1024)).toFixed(1).replace('.', ',');
    return `Файл слишком большой: ${mb} МБ при пределе ${limits.maxSizeMb} МБ.`;
  }
  return undefined;
};

export const FilePicker = ({
  ariaLabel,
  onSelect,
  accept,
  disabled,
  buttonLabel = 'Выбрать файл',
  fileName,
  resetAfterSelect,
  maxSizeMb,
  capture,
  previewUrl,
  progress,
  error,
  onReject,
  variant = 'inline'
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
  /** Предел размера. Задан — показывается в требованиях и проверяется до отправки. */
  maxSizeMb?: number;
  /** Камера на телефоне: `user` — селфи, `environment` — снимок документа. */
  capture?: 'user' | 'environment';
  /** Ссылка на превью выбранного изображения (её делает экран и он же освобождает). */
  previewUrl?: string | null;
  /** 0…100 — идёт отправка. */
  progress?: number;
  /** Понятная ошибка под кнопкой. */
  error?: string | null;
  /** Файл не подошёл: причина уходит экрану, наверх файл не идёт. */
  onReject?: (reason: string) => void;
  /** `dropzone` — крупная область с перетаскиванием; `inline` — прежняя кнопка. */
  variant?: 'inline' | 'dropzone';
}): ReactElement => {
  const requirements =
    variant === 'dropzone' || maxSizeMb !== undefined
      ? fileRequirementsText(accept, maxSizeMb)
      : undefined;

  const take = (file: File | null): void => {
    if (!file) {
      onSelect(null);
      return;
    }
    const reason = fileRejectionReason(file, {
      ...(accept ? { accept } : {}),
      ...(maxSizeMb !== undefined ? { maxSizeMb } : {})
    });
    if (reason) {
      onReject?.(reason);
      return;
    }
    onSelect(file);
  };

  const onDrop = (event: DragEvent<HTMLLabelElement>): void => {
    event.preventDefault();
    if (disabled) return;
    take(event.dataTransfer?.files?.[0] ?? null);
  };

  const picker = (
    <label
      className={variant === 'dropzone' ? 'ui-file-picker ui-file-picker--drop' : 'ui-file-picker'}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
    >
      <input
        type="file"
        className="ui-file-picker__input"
        aria-label={ariaLabel}
        {...(accept ? { accept } : {})}
        {...(capture ? { capture } : {})}
        {...(disabled ? { disabled: true } : {})}
        onChange={(event) => {
          take(event.target.files?.[0] ?? null);
          if (resetAfterSelect) event.target.value = '';
        }}
      />
      {variant === 'dropzone' ? (
        <span className="ui-file-picker__call">Перетащите файл сюда или</span>
      ) : null}
      <span className="ui-button ui-file-picker__button" aria-hidden>
        {capture ? 'Сделать фото или выбрать' : buttonLabel}
      </span>
      {fileName !== undefined ? (
        <span className="ui-file-picker__name">{fileName ?? 'Файл не выбран'}</span>
      ) : null}
    </label>
  );

  const extras =
    requirements !== undefined ||
    previewUrl != null ||
    progress !== undefined ||
    (error ?? null) !== null;

  /*
   * Без единой добавки возвращается ровно прежняя разметка: восемь экранов, где выбор файла
   * стоит в ячейке таблицы или в строке формы, не должны поехать из-за новой обёртки.
   */
  if (!extras) return picker;

  return (
    <div className="ui-stack ui-file-field">
      {picker}
      {requirements === undefined ? null : <p className="ui-field-hint">{requirements}</p>}
      {previewUrl == null ? null : (
        <img className="ui-file-preview" src={previewUrl} alt="Предпросмотр выбранного файла" />
      )}
      {progress === undefined ? null : (
        <progress className="ui-file-progress" max={100} value={progress}>
          {`Отправлено ${progress}%`}
        </progress>
      )}
      {(error ?? null) === null ? null : (
        <p className="ui-field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};
