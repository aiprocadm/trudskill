'use client';

import { DataTable, FilterBar } from '@trudskill/ui';
import { useState } from 'react';

import { BarChart } from './charts';
import { formatDays, formatPercent } from './format';
import { useAnalyticsDashboard } from './hooks';
import { PageContainer, PageHeader, SectionCard } from '../../components/state-wrappers';

import type { AnalyticsFilterQuery } from './types';

export function AnalyticsDashboardScreen() {
  const [courseId, setCourseId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [clientId, setClientId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const query: AnalyticsFilterQuery = {
    ...(courseId.trim() ? { course_id: courseId.trim() } : {}),
    ...(groupId.trim() ? { group_id: groupId.trim() } : {}),
    ...(clientId.trim() ? { client_id: clientId.trim() } : {}),
    ...(from ? { enrolled_from: from } : {}),
    ...(to ? { enrolled_to: to } : {})
  };
  const dash = useAnalyticsDashboard(query);
  const d = dash.data;

  return (
    <PageContainer>
      <PageHeader
        title="Аналитика обучения"
        subtitle="Завершаемость, сдача экзаменов, средний срок и балл, drop-off — с фильтром по курсу, группе и компании"
      />
      <SectionCard title="Фильтр">
        <FilterBar>
          <label>
            Курс (id)
            <input
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              placeholder="course_id"
            />
          </label>
          <label>
            Группа (id)
            <input
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              placeholder="group_id"
            />
          </label>
          <label>
            Компания (id)
            <input
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="client_id"
            />
          </label>
          <label>
            С<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>
            По
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </FilterBar>
      </SectionCard>

      {dash.error ? (
        <SectionCard title="Ошибка">
          <p className="ui-text-muted">{dash.error}</p>
        </SectionCard>
      ) : null}
      {dash.loading ? (
        <SectionCard title="Загрузка">
          <p className="ui-text-muted">Загрузка аналитики…</p>
        </SectionCard>
      ) : null}

      {!dash.loading && !dash.error && d ? (
        <>
          <SectionCard title="Ключевые показатели">
            <div className="stat-grid">
              <div className="stat-card">
                <span className="stat-card__label">Зачислений</span>
                <span className="stat-card__value">{d.enrollmentsTotal}</span>
                <span className="stat-card__sub">завершено {d.enrollmentsCompleted}</span>
              </div>
              <div className="stat-card">
                <span className="stat-card__label">Завершаемость</span>
                <span className="stat-card__value">{formatPercent(d.completionRate)}</span>
              </div>
              <div className="stat-card">
                <span className="stat-card__label">Сдача экзаменов</span>
                <span className="stat-card__value">{formatPercent(d.examPassRate)}</span>
                <span className="stat-card__sub">
                  {d.examResultsPassed}/{d.examResultsTotal}
                </span>
              </div>
              <div className="stat-card">
                <span className="stat-card__label">Средний срок прохождения</span>
                <span className="stat-card__value">{formatDays(d.averageCompletionDays)}</span>
              </div>
              <div className="stat-card">
                <span className="stat-card__label">Средний балл</span>
                <span className="stat-card__value">{formatPercent(d.averageScorePercent)}</span>
              </div>
              <div className="stat-card">
                <span className="stat-card__label">Drop-off</span>
                <span className="stat-card__value">{d.dropOffCount}</span>
                <span className="stat-card__sub">
                  нет активности &gt; {d.dropOffThresholdDays} дн.
                </span>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Завершаемость по курсам">
            <BarChart
              ariaLabel="Завершённые зачисления по курсам"
              data={d.byCourse.map((r) => ({ label: r.label, value: r.enrollmentsCompleted }))}
            />
          </SectionCard>

          <SectionCard title="С какой попытки сдают экзамен">
            <BarChart
              ariaLabel="Распределение попыток до сдачи"
              data={[
                { label: 'С 1-й попытки', value: d.attemptDistribution.passedFirstAttempt },
                { label: 'Со 2-й попытки', value: d.attemptDistribution.passedSecondAttempt },
                { label: '3+ попытки', value: d.attemptDistribution.passedThirdPlusAttempt }
              ]}
            />
          </SectionCard>

          <SectionCard title="Разбивка по курсам">
            <DataTable
              columns={[
                { key: 'label', title: 'Курс' },
                { key: 'enrollmentsTotal', title: 'Зачислений' },
                { key: 'enrollmentsCompleted', title: 'Завершено' },
                { key: 'completionRateText', title: 'Завершаемость' },
                { key: 'examPassRateText', title: 'Сдача' },
                { key: 'avgScoreText', title: 'Средний балл' }
              ]}
              rows={d.byCourse.map((r) => ({
                ...r,
                completionRateText: formatPercent(r.completionRate),
                examPassRateText: formatPercent(r.examPassRate),
                avgScoreText: formatPercent(r.averageScorePercent)
              }))}
            />
          </SectionCard>

          <SectionCard title="Разбивка по группам">
            <DataTable
              columns={[
                { key: 'label', title: 'Группа' },
                { key: 'enrollmentsTotal', title: 'Зачислений' },
                { key: 'enrollmentsCompleted', title: 'Завершено' },
                { key: 'completionRateText', title: 'Завершаемость' },
                { key: 'examPassRateText', title: 'Сдача' },
                { key: 'avgScoreText', title: 'Средний балл' }
              ]}
              rows={d.byGroup.map((r) => ({
                ...r,
                completionRateText: formatPercent(r.completionRate),
                examPassRateText: formatPercent(r.examPassRate),
                avgScoreText: formatPercent(r.averageScorePercent)
              }))}
            />
          </SectionCard>
        </>
      ) : null}
    </PageContainer>
  );
}
