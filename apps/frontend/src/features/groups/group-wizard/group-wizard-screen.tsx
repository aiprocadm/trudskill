'use client';

import { LoadingState, WizardSteps } from '@trudskill/ui';
import { useRef, useState } from 'react';

import {
  EMPTY_WIZARD_STATE,
  buildWizardRequest,
  canProceed,
  copyStateFrom,
  groupPayloadOf,
  shouldRotateKey,
  todayLocalIso
} from './group-wizard-model';
import { StepAccess, StepLearners, StepWhat, StepWho, WizardResult } from './group-wizard-steps';
import {
  PageContainer,
  PageHeader,
  RecordNotFound,
  SectionError
} from '../../../components/state-wrappers';
import { useUnsavedForm } from '../../../components/use-unsaved-form';
import { useAuth } from '../../auth/context';
import {
  useDomainMutations,
  useEnrollments,
  useGroup,
  useGroupCourses,
  useNextGroupCode
} from '../../mvp/hooks';

import type { WizardState, WizardStepId } from './group-wizard-model';
import type { GroupWizardOutcome } from '../../mvp/types';

/*
 * Четыре шага по ТЗ перехода §6.2 (РМ48): каждый — один экран с одной кнопкой «Далее: …»;
 * сторож `page-templates-match-spec` считает шаги по этому списку (≤4).
 */
const STEPS = [
  { id: 'who', title: 'Кто учится' },
  { id: 'what', title: 'Что и когда' },
  { id: 'learners', title: 'Слушатели' },
  { id: 'access', title: 'Доступы и проверка' }
];

const NEXT_STEP: Record<WizardStepId, WizardStepId | null> = {
  who: 'what',
  what: 'learners',
  learners: 'access',
  access: null
};

const COPY_PAGE = { page: 1, page_size: 200 } as const;

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `idem_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Мастер создания группы (МГ-B2, TPL-004; срез 8.5).
 *
 * Было: короткая форма из полей группы, после которой админ шёл по трём экранам — курсы,
 * слушатели, зачисления — и мог остановиться на полпути с группой без курса. Стало: четыре
 * шага и один вызов `POST /groups/wizard` в конце — группа, курсы, слушатели, зачисления и
 * доступы одной транзакцией. Черновик уходит на сервер после шага 1 (РМ52, РМ56): если
 * человек бросит мастер, группа останется в реестре под статусом «Черновик», а не пропадёт.
 *
 * `copyOf` (МГ-B6.1, срез 8.6): мастер открывается с предзаполнением из существующей группы —
 * данные грузятся отдельным компонентом, а форма стартует уже с готовым состоянием, поэтому
 * предзаполнение не считается «несохранёнными изменениями».
 */
export const GroupWizardScreen = ({ copyOf }: { copyOf?: string | undefined }) =>
  copyOf ? <GroupCopyLoader copyOf={copyOf} /> : <GroupWizardForm />;

const GroupCopyLoader = ({ copyOf }: { copyOf: string }) => {
  const source = useGroup(copyOf);
  const courses = useGroupCourses(copyOf);
  const enrollments = useEnrollments({ ...COPY_PAGE, group_id: copyOf });
  if (source.notFound) {
    return <RecordNotFound what="Группа для копии" backHref="/groups" backLabel="К группам" />;
  }
  const loadError = source.error ?? courses.error ?? enrollments.error;
  if (loadError) {
    return (
      <PageContainer>
        <PageHeader title="Новая группа" />
        <SectionError
          message={`Не удалось загрузить исходную группу: ${loadError}`}
          onRetry={() =>
            void Promise.all([source.refetch(), courses.refetch(), enrollments.refetch()])
          }
        />
      </PageContainer>
    );
  }
  if (!source.data || !courses.data || !enrollments.data) {
    return (
      <PageContainer>
        <PageHeader title="Новая группа" />
        <LoadingState message="Загружаем группу, чтобы скопировать…" />
      </PageContainer>
    );
  }
  const initial = copyStateFrom(
    {
      group: source.data,
      courseIds: courses.data.items.map((course) => course.courseId),
      enrollments: enrollments.data.items
    },
    todayLocalIso()
  );
  return <GroupWizardForm initial={initial} sourceName={source.data.name} />;
};

const GroupWizardForm = ({
  initial = EMPTY_WIZARD_STATE,
  sourceName
}: {
  initial?: WizardState;
  sourceName?: string;
}) => {
  const { session } = useAuth();
  const { saveGroupDraft, completeGroupWizard } = useDomainMutations();
  const nextCode = useNextGroupCode();
  const [state, setState] = useState<WizardState>(initial);
  const [step, setStep] = useState<WizardStepId>('who');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [outcome, setOutcome] = useState<GroupWizardOutcome | null>(null);
  /* РМ57: ключ живёт, пока сервер не отверг тело (4xx); сетевой сбой ключ не меняет. */
  const keyRef = useRef(newIdempotencyKey());

  const patch = (next: Partial<WizardState>) => setState((prev) => ({ ...prev, ...next }));
  const unsavedGuard = useUnsavedForm({ ...state }, { saving: busy || Boolean(outcome) });
  const userId = session?.user.id ?? '';

  const goNext = async () => {
    if (!canProceed(step, state).ok) return;
    const next = NEXT_STEP[step];
    setError(null);
    if (step === 'who' && !state.draftId) {
      /* Черновик один раз; дальнейшие правки шага 1 уедут в завершении вместе с draftId. */
      setBusy(true);
      try {
        const draft = await saveGroupDraft(null, {
          ...groupPayloadOf(state, userId),
          status: 'draft'
        });
        patch({ draftId: draft.id });
      } catch (draftError) {
        setError(draftError);
        return;
      } finally {
        setBusy(false);
      }
    }
    if (next) setStep(next);
  };

  const finish = async () => {
    if (!canProceed('access', state).ok) return;
    setBusy(true);
    setError(null);
    try {
      const result = await completeGroupWizard(buildWizardRequest(state, keyRef.current, userId));
      setOutcome(result);
    } catch (finishError) {
      if (shouldRotateKey(finishError)) keyRef.current = newIdempotencyKey();
      setError(finishError);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setState(EMPTY_WIZARD_STATE);
    setOutcome(null);
    setError(null);
    setStep('who');
    keyRef.current = newIdempotencyKey();
    void nextCode.refetch();
  };

  const stepProps = { state, patch, busy };
  const suggestedCode = nextCode.data?.code ?? null;

  return (
    <PageContainer>
      {unsavedGuard}
      <PageHeader
        title="Новая группа"
        subtitle={
          sourceName
            ? `Копия группы «${sourceName}»: проверьте даты и состав — код будет новым`
            : 'Кто учится, чему и когда, кого зачислить и как выдать доступы — четыре шага, одна группа'
        }
      />
      <WizardSteps
        steps={STEPS}
        currentId={step}
        label="Шаги создания группы"
        /* Назад — можно, вперёд — только кнопкой шага; после создания шаги не переключаются. */
        {...(outcome ? {} : { onSelect: (id: string) => setStep(id as WizardStepId) })}
      />
      {error !== null ? <SectionError error={error} /> : null}
      {outcome ? (
        <WizardResult outcome={outcome} state={state} onReset={reset} />
      ) : (
        <>
          {step === 'who' ? (
            <StepWho {...stepProps} suggestedCode={suggestedCode} onNext={() => void goNext()} />
          ) : null}
          {step === 'what' ? (
            <StepWhat {...stepProps} onNext={() => void goNext()} onBack={() => setStep('who')} />
          ) : null}
          {step === 'learners' ? (
            <StepLearners
              {...stepProps}
              onNext={() => void goNext()}
              onBack={() => setStep('what')}
            />
          ) : null}
          {step === 'access' ? (
            <StepAccess
              {...stepProps}
              suggestedCode={suggestedCode}
              onNext={() => void finish()}
              onBack={() => setStep('learners')}
            />
          ) : null}
        </>
      )}
    </PageContainer>
  );
};
