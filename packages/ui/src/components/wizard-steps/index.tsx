import type { ReactElement } from 'react';

export interface WizardStep {
  id: string;
  /** Что человек делает на этом шаге: «Файл», «Проверка», «Результат». */
  title: string;
}

/**
 * Шаги мастера (TPL-004 §7.4).
 *
 * Разметку степпера в приложении уже дважды скопировали по экранам — компонент сводит
 * её к одной реализации. Назад по шагам вернуться можно, вперёд перепрыгнуть нельзя:
 * непроверенный шаг даёт наполовину заполненный результат.
 *
 * На телефоне (≤480px) полоса шагов заменяется строкой «Шаг 2 из 3» — требование §7.4.
 * Подмена сделана стилями, а не вторым деревом: иначе счётчик и полоса разъезжаются.
 */
export const WizardSteps = ({
  steps,
  currentId,
  onSelect,
  label = 'Шаги'
}: {
  steps: WizardStep[];
  currentId: string;
  /** Не задан — шаги показываются, но не переключаются кликом. */
  onSelect?: (id: string) => void;
  label?: string;
}): ReactElement | null => {
  if (steps.length === 0) return null;

  const currentIndex = Math.max(
    0,
    steps.findIndex((step) => step.id === currentId)
  );

  return (
    <div className="ui-stepper-wrap">
      <p className="ui-stepper__counter" aria-hidden="true">
        Шаг {currentIndex + 1} из {steps.length}: {steps[currentIndex]?.title}
      </p>
      <ol className="ui-stepper" aria-label={label}>
        {steps.map((step, index) => {
          const state = index < currentIndex ? 'done' : index === currentIndex ? 'active' : 'ahead';
          const className = ['ui-step', state === 'ahead' ? '' : `ui-step--${state}`]
            .filter(Boolean)
            .join(' ');
          return (
            <li key={step.id} className={className}>
              <button
                type="button"
                className="ui-step__button"
                // Шаг открывается и с клавиатуры, а не только мышью по <li>.
                onClick={() => onSelect?.(step.id)}
                disabled={!onSelect || index >= currentIndex}
                {...(state === 'active' ? { 'aria-current': 'step' as const } : {})}
              >
                {index + 1}. {step.title}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
};
