import { Button } from '../button/index.js';

import type { ReactElement } from 'react';

/**
 * Копирование значения в буфер обмена (ТЗ «Стабилизация, UX и развитие», 4.2 / Я2).
 *
 * Появился ради тегов бланка: человек видел на экране `{%tenant.signature_image}` и должен
 * был перепечатать это в документ без ошибок. Теперь тег копируется кнопкой, а показывается
 * только если буфер обмена недоступен.
 *
 * `false` — буфера обмена нет (страница не по HTTPS, старый браузер) или доступ запрещён.
 * Вызывающий тогда показывает значение текстом: человек должен получить результат в любом случае.
 */
export const copyText = async (value: string): Promise<boolean> => {
  const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard;
  if (!clipboard || typeof clipboard.writeText !== 'function') return false;
  try {
    await clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
};

/**
 * Кнопка называет результат и не переименовывается по ходу (TXT-002/TXT-003): подпись
 * постоянная, а «Скопировано» — отдельная строка состояния рядом. Состояние держит вызывающий:
 * ему же решать, что показать, если копирование не удалось.
 */
export const CopyButton = ({
  value,
  label,
  copied = false,
  copiedLabel = 'Скопировано',
  onCopy,
  disabled = false
}: {
  value: string;
  label: string;
  copied?: boolean;
  copiedLabel?: string;
  onCopy: (ok: boolean) => void;
  disabled?: boolean;
}): ReactElement => (
  <span className="ui-inline">
    <Button
      variant="secondary"
      disabled={disabled}
      onClick={() => {
        void copyText(value).then(onCopy);
      }}
    >
      {label}
    </Button>
    {copied ? (
      <span className="ui-text-muted" role="status">
        {copiedLabel}
      </span>
    ) : null}
  </span>
);
