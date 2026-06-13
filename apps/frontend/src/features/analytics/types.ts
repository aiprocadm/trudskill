import type { BaseFilterQuery } from '../mvp/types';

export type AnalyticsFilterQuery = BaseFilterQuery & {
  course_id?: string;
  group_id?: string;
  client_id?: string;
  enrolled_from?: string;
  enrolled_to?: string;
};

export interface AnalyticsBreakdownRow {
  key: string;
  label: string;
  enrollmentsTotal: number;
  enrollmentsCompleted: number;
  completionRate: number;
  examPassRate: number;
  averageScorePercent: number | null;
}

export interface AnalyticsAttemptDistribution {
  passedFirstAttempt: number;
  passedSecondAttempt: number;
  passedThirdPlusAttempt: number;
}

export interface AnalyticsDashboard {
  scope: {
    courseId?: string;
    groupId?: string;
    clientId?: string;
    enrolledFrom?: string;
    enrolledTo?: string;
  };
  enrollmentsTotal: number;
  enrollmentsCompleted: number;
  completionRate: number;
  examResultsTotal: number;
  examResultsPassed: number;
  examPassRate: number;
  averageCompletionDays: number | null;
  averageScorePercent: number | null;
  attemptDistribution: AnalyticsAttemptDistribution;
  dropOffCount: number;
  dropOffThresholdDays: number;
  byCourse: AnalyticsBreakdownRow[];
  byGroup: AnalyticsBreakdownRow[];
}
