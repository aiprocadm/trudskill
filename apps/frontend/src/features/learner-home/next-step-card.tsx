'use client';

import Link from 'next/link';

import type { NextStep } from './types';

interface Props {
  step: NextStep | null;
  loading: boolean;
}

const Eyebrow = () => <p className="ui-hero__eyebrow">Следующий шаг</p>;

export const NextStepCard = ({ step, loading }: Props) => {
  if (loading) {
    return (
      <section className="ui-hero" aria-busy="true" aria-label="Следующий шаг">
        <span className="ui-hero__seal" aria-hidden />
        <Eyebrow />
        <div className="ui-skeleton-block" aria-hidden>
          <div className="ui-skeleton-line" style={{ width: '58%', height: 22 }} />
          <div className="ui-skeleton-line" style={{ width: '82%' }} />
        </div>
      </section>
    );
  }

  if (!step) {
    return (
      <section className="ui-hero ui-hero--calm" aria-label="Следующий шаг">
        <span className="ui-hero__seal" aria-hidden />
        <Eyebrow />
        <h2 className="ui-hero__title">Пока нет назначенных курсов</h2>
        <p className="ui-hero__desc">
          Обратитесь к куратору учебного центра — он назначит вам обучение.
        </p>
      </section>
    );
  }

  return (
    <section className="ui-hero" aria-label="Следующий шаг">
      <span className="ui-hero__seal" aria-hidden />
      <Eyebrow />
      <h2 className="ui-hero__title">{step.headline}</h2>
      {step.description ? <p className="ui-hero__desc">{step.description}</p> : null}
      <Link href={step.href} className="ui-hero__cta" data-testid="next-step-cta">
        {step.cta}
      </Link>
    </section>
  );
};
