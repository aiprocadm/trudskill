'use client';

import { useMemo } from 'react';

import { MoreInLearning } from './more-in-learning';
import { MyCoursesList } from './my-courses-list';
import { pickNextStep } from './next-step';
import { NextStepCard } from './next-step-card';
import { RecentDocumentsCard } from './recent-documents-card';
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
    <PageContainer spacious>
      <PageHeader
        title={greeting}
        subtitle="Ваше обучение: следующий шаг, курсы и документы"
        toolsSlot={<RoleSwitcher />}
      />
      {error ? <SectionError message={error} /> : null}
      <NextStepCard step={nextStep} loading={isLoading} />
      <div className="learner-home-columns">
        <MyCoursesList entries={data} loading={isLoading} />
        <RecentDocumentsCard />
      </div>
      {/*
        ТЗ 6.1 (С1): «Задания», «Вебинары» и «Календарь» ушли из меню внутрь «Обучения».
        Сначала появился вход отсюда — убрать пункт раньше входа значило бы спрятать раздел
        насовсем (журнал 491).
      */}
      <MoreInLearning />
    </PageContainer>
  );
};
