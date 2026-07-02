import type { LucideIcon } from 'lucide-react';
import type { ReactElement } from 'react';

/** Шкала размеров иконок: 16 — в тексте/кнопке, 18 — по умолчанию, 20 — навигация, 24 — акцент. */
export type UiIconSize = 16 | 18 | 20 | 24;

// Единая точка стилизации иконок: один stroke, фиксированная шкала размеров.
// Без label иконка декоративная (aria-hidden); с label — самостоятельный смысл (role=img).
export const Icon = ({
  icon: Glyph,
  size = 18,
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
