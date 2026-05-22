'use client';

import Link from 'next/link';

import { SectionCard, SectionEmpty } from '../../components/state-wrappers';

import type { NextStep } from './types';

interface Props {
  step: NextStep | null;
  loading: boolean;
}

export const NextStepCard = ({ step, loading }: Props) => {
  if (loading) {
    return (
      <SectionCard title="Следующий шаг">
        <p className="ui-text-muted">Подбираем, что вам сейчас открыть…</p>
      </SectionCard>
    );
  }

  if (!step) {
    return (
      <SectionCard title="Следующий шаг">
        <SectionEmpty
          message="Пока нет назначенных курсов"
          hint="Обратитесь к куратору учебного центра — он назначит вам обучение."
        />
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Следующий шаг">
      <div className="ui-stack" style={{ gap: 12 }}>
        <div>
          <h3 className="ui-page-title" style={{ margin: 0 }}>
            {step.headline}
          </h3>
          {step.description ? <p className="ui-text-muted">{step.description}</p> : null}
        </div>
        <Link href={step.href} className="ui-button ui-button--primary" data-testid="next-step-cta">
          {step.cta}
        </Link>
      </div>
    </SectionCard>
  );
};
