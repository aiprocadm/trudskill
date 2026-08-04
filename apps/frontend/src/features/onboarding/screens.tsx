'use client';

import { useQuery } from '@tanstack/react-query';
import { LoadingState } from '@trudskill/ui';
import Link from 'next/link';

import { onboardingApi } from './api';
import {
  ONBOARDING_STEP_META,
  type OnboardingStepDto,
  onboardingPercent,
  orderStepsForDisplay
} from './types';
import { SectionCard, SectionError } from '../../components/state-wrappers';
import { useAuth } from '../auth/context';

/**
 * ФТ-D2.3: мастер онбординга — чек-лист из шести шагов со ссылками на настоящие экраны.
 *
 * Мастер НЕ дублирует формы: каждый шаг делается там, где живёт его настройка, иначе
 * появилось бы два места ввода одних и тех же реквизитов. Прогресс приходит с сервера
 * и считается из данных, поэтому «продолжить» ведёт на первый незакрытый шаг — терять
 * введённое некуда, оно уже сохранено.
 */

function StepRow({ step, canDo }: { step: OnboardingStepDto; canDo: boolean }) {
  const meta = ONBOARDING_STEP_META[step.id];
  return (
    <div className="ui-stack" style={{ gap: 2 }}>
      <p>
        <strong>
          {step.done ? '✓ ' : '○ '}
          {meta.title}
        </strong>
        {step.detail ? <span className="ui-text-muted"> — {step.detail}</span> : null}
      </p>
      <p className="ui-text-muted">{meta.hint}</p>
      {canDo ? (
        <p>
          <Link href={meta.href}>{step.done ? 'Изменить' : 'Настроить'}</Link>
        </p>
      ) : (
        <p className="ui-text-muted">
          Нужен доступ «{meta.requiredPermission}» — попросите администратора центра.
        </p>
      )}
    </div>
  );
}

export function OnboardingScreen() {
  const { session } = useAuth();
  const statusQuery = useQuery({
    queryKey: ['tenant-onboarding', session?.user.tenantId],
    enabled: Boolean(session),
    queryFn: () => onboardingApi.get(session!)
  });

  const status = statusQuery.data;
  const percent = status ? onboardingPercent(status) : 0;
  const nextMeta = status?.nextStepId ? ONBOARDING_STEP_META[status.nextStepId] : null;
  const can = (permission: string) => Boolean(session?.permissions.includes(permission));

  return (
    <>
      <SectionCard title="Готовность центра">
        {statusQuery.isLoading ? <LoadingState message="Проверяем настройки…" /> : null}
        {statusQuery.error ? (
          <SectionError
            message={
              statusQuery.error instanceof Error
                ? statusQuery.error.message
                : 'Не удалось загрузить состояние онбординга'
            }
          />
        ) : null}

        {status ? (
          <div className="ui-stack">
            <p>
              <strong>
                Готово {status.doneCount} из {status.totalCount}
              </strong>{' '}
              — {percent}%
            </p>
            <div
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              style={{ background: 'var(--ui-surface-muted)', borderRadius: 6, height: 8 }}
            >
              <div
                style={{
                  width: `${percent}%`,
                  height: 8,
                  borderRadius: 6,
                  background: status.ready ? 'var(--ui-success-600)' : 'var(--ui-brand-600)'
                }}
              />
            </div>
            {status.ready ? (
              <p className="ui-callout ui-callout--success">
                Центр настроен: можно зачислять слушателей и выдавать документы.
              </p>
            ) : nextMeta ? (
              <p>
                Продолжить с шага «{nextMeta.title}»: <Link href={nextMeta.href}>перейти</Link>
              </p>
            ) : null}
          </div>
        ) : null}
      </SectionCard>

      {status ? (
        <SectionCard title="Шаги настройки">
          <div className="ui-stack">
            {orderStepsForDisplay(status.steps).map((step) => (
              <StepRow
                key={step.id}
                step={step}
                canDo={can(ONBOARDING_STEP_META[step.id].requiredPermission)}
              />
            ))}
          </div>
        </SectionCard>
      ) : null}
    </>
  );
}
