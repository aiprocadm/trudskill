import type { ReactElement } from 'react';

/**
 * Полоса заполнения — одна на всё приложение.
 *
 * Сверка перед срезом 22 нашла **восемь** самодельных полос: шесть через голый `<progress>`
 * и две нарисованные вручную блоками с инлайновыми цветами. Выглядели они по-разному, а
 * тон (зелёный / жёлтый / красный) знала только одна из них.
 *
 * `tone` отделён от `value` намеренно. «Сколько заполнено» и «хорошо это или плохо» — разные
 * вопросы: прогресс по курсу на 90% это отлично, а расход лимита на 90% — тревога. Считать
 * тон из числа значило бы красить один из этих случаев неверно.
 */
export type ProgressTone = 'brand' | 'ok' | 'warning' | 'danger';

export const ProgressBar = ({
  value,
  label,
  caption,
  tone = 'brand'
}: {
  /** Заполнение в процентах; значения вне 0…100 подрезаются. */
  value: number;
  /** Что измеряем — обязательно для тех, кто слушает экран голосом. */
  label: string;
  /** Подпись под полосой: «12 из 50», «45%». Без неё полоса — это картинка без числа. */
  caption?: string;
  tone?: ProgressTone;
}): ReactElement => {
  const safe = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="ui-progress">
      <div
        className={`ui-progress__track ui-progress__track--${tone}`}
        role="progressbar"
        aria-label={label}
        aria-valuenow={safe}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="ui-progress__fill" style={{ width: `${safe}%` }} />
      </div>
      {caption ? <small className="ui-progress__caption">{caption}</small> : null}
    </div>
  );
};
