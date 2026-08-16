'use client';

import { useQuery } from '@tanstack/react-query';
import { LoadingState, ProgressBar, type ProgressTone } from '@trudskill/ui';

import { usageApi } from './api';
import {
  FEATURE_LABELS,
  type PlanFeaturesDto,
  type UsageLevel,
  formatGb,
  usageLevel,
  usagePercent
} from './types';
import { SectionCard, SectionEmpty, SectionError } from '../../components/state-wrappers';
import { useAuth } from '../auth/context';

/**
 * ФТ-D4.2: экран «Использование» — тариф, счётчики против лимитов, предупреждения
 * на 80/95%. Мягкая деградация проговаривается текстом: при исчерпании нельзя
 * добавить НОВЫХ слушателей, идущие группы продолжают учиться.
 */

const LEVEL_TEXT: Record<Exclude<UsageLevel, 'unlimited' | 'ok'>, string> = {
  warning: 'использовано больше 80% лимита',
  critical: 'использовано больше 95% лимита — пора расширять тариф',
  exceeded: 'лимит исчерпан'
};

/** Тон полосы: заполнение и «хорошо ли это» — разные вещи, поэтому считается отдельно. */
const TONE_BY_LEVEL: Record<UsageLevel, ProgressTone> = {
  unlimited: 'brand',
  ok: 'ok',
  warning: 'warning',
  critical: 'danger',
  exceeded: 'danger'
};

function MetricRow({
  label,
  used,
  limit,
  render = (value: number) => String(value),
  exceededHint
}: {
  label: string;
  used: number;
  limit: number | null;
  render?: (value: number) => string;
  exceededHint?: string;
}) {
  const level = usageLevel(used, limit);
  const percent = usagePercent(used, limit);
  return (
    <div className="ui-stack" style={{ gap: 4 }}>
      <p>
        <strong>{label}:</strong> {render(used)}
        {limit !== null ? ` из ${render(limit)}` : ' (без ограничения)'}
      </p>
      {percent !== null ? (
        <ProgressBar
          value={percent}
          label={label}
          caption={`${percent}% лимита`}
          tone={TONE_BY_LEVEL[level]}
        />
      ) : null}
      {level === 'warning' || level === 'critical' || level === 'exceeded' ? (
        <p
          className={`ui-callout ${level === 'warning' ? 'ui-callout--warning' : 'ui-callout--danger'}`}
        >
          {label}: {LEVEL_TEXT[level]}.
          {level === 'exceeded' && exceededHint ? ` ${exceededHint}` : ''}
        </p>
      ) : null}
    </div>
  );
}

export function TenantUsageScreen() {
  const { session } = useAuth();
  const usageQuery = useQuery({
    queryKey: ['tenant-usage', session?.user.tenantId],
    enabled: Boolean(session),
    queryFn: () => usageApi.get(session!)
  });

  const data = usageQuery.data;
  const features = data?.plan?.features ?? {};
  const enabledFeatures = (Object.keys(FEATURE_LABELS) as (keyof PlanFeaturesDto)[]).filter(
    (key) => features[key]
  );

  return (
    <>
      <SectionCard title="Тариф">
        {usageQuery.isLoading ? <LoadingState message="Загрузка использования…" /> : null}
        {usageQuery.error ? (
          <SectionError
            message={
              usageQuery.error instanceof Error
                ? usageQuery.error.message
                : 'Не удалось загрузить использование'
            }
          />
        ) : null}
        {data ? (
          data.plan ? (
            <div className="ui-stack">
              <p>
                <strong>{data.plan.name}</strong>
              </p>
              <p className="ui-text-muted">
                Доступно по тарифу:{' '}
                {enabledFeatures.length
                  ? enabledFeatures.map((key) => FEATURE_LABELS[key]).join(', ')
                  : 'только базовые функции'}
              </p>
            </div>
          ) : (
            <p className="ui-text-muted">
              Тариф не назначен — все статьи без ограничений. Тариф назначает администратор
              платформы.
            </p>
          )
        ) : null}
        {!usageQuery.isLoading && !usageQuery.error && !data ? (
          <SectionEmpty
            message="Данные о тарифе пока не пришли"
            hint="Тариф и счётчики появляются после первого расчётного периода центра. Тариф назначает администратор платформы."
          />
        ) : null}
      </SectionCard>

      {data ? (
        <SectionCard title="Использование">
          <div className="ui-stack">
            <MetricRow
              label="Активные слушатели в этом месяце"
              used={data.activeLearners.used}
              limit={data.activeLearners.limit}
              exceededHint="Новых слушателей добавить нельзя; идущие группы продолжают обучение."
            />
            <MetricRow label="Сотрудники центра" used={data.staff.used} limit={data.staff.limit} />
            <MetricRow
              label="Хранилище"
              used={data.storage.usedBytes}
              limit={data.storage.limitBytes}
              render={formatGb}
            />
          </div>
        </SectionCard>
      ) : null}
    </>
  );
}
