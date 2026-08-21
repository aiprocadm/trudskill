import type { LucideIcon } from 'lucide-react';
import type { ReactElement } from 'react';

/**
 * Шкала размеров иконок (`UI-024`): 16 — в строке текста и в кнопке, 20 — в меню,
 * 24 — в заголовке.
 *
 * Ступень 18 убрана осознанно: ТЗ перечисляет ровно три размера, а «по умолчанию 18»
 * означало, что почти каждая иконка оказывалась вне шкалы, ничего об этом не сообщая.
 * Значение по умолчанию — 16: подавляющее большинство иконок стоит в строке.
 */
export type UiIconSize = 16 | 20 | 24;

// Единая точка стилизации иконок: один stroke, фиксированная шкала размеров.
// Без label иконка декоративная (aria-hidden); с label — самостоятельный смысл (role=img).
export const Icon = ({
  icon: Glyph,
  size = 16,
  label
}: {
  icon: LucideIcon;
  size?: UiIconSize;
  label?: string;
}): ReactElement => (
  <Glyph
    size={size}
    strokeWidth={1.75}
    focusable={false}
    aria-hidden={label ? undefined : true}
    {...(label ? { 'aria-label': label, role: 'img' } : {})}
  />
);

export type { LucideIcon };
