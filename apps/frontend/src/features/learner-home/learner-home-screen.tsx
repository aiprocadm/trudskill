'use client';

import { useMemo } from 'react';

import { MyCoursesList } from './my-courses-list';
import { pickNextStep } from './next-step';
import { NextStepCard } from './next-step-card';
import { RoleSwitcher } from './role-switcher-tabs';
import { useLearnerHomeData } from './use-learner-home-data';
import { PageContainer, PageHeader, SectionError } from '../../components/state-wrappers';
import { useAuth } from '../auth/context';

export const LearnerHomeScreen = () => {
  const { session } = useAuth();
  const { data, isLoading, error } = useLearnerHomeData();

  const nextStep = useMemo(() => pickNextStep(data), [data]);
  const greeting = session?.user.displayName
    ? `Здравствуйте, ${session.user.displayName}`
    : 'Главная';

  return (
    <PageContainer>
      <PageHeader title={greeting} subtitle="Главный экран ученика" actions={<RoleSwitcher />} />
      {error ? <SectionError message={error} /> : null}
      <NextStepCard step={nextStep} loading={isLoading} />
      <MyCoursesList entries={data} loading={isLoading} />
    </PageContainer>
  );
};
