'use client';

import { Icon, LoadingState } from '@trudskill/ui';
import Link from 'next/link';

import { useAttempt, useAttemptResultView, useMyTests } from './hooks';
import {
  CONTACT_CENTER_HREF,
  CONTACT_CENTER_LABEL,
  dueUrgency,
  outcomeTone,
  scoreSummary
} from './result-view';
import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../components/state-wrappers';
import { CheckCircleIcon, CircleXIcon } from '../navigation/nav-icons';
import { useObjectCrumb } from '../navigation/use-object-crumb';

/**
 * Экран результата проверки знаний (ТЗ «Стабилизация, UX и развитие», 10.4, пункт 5).
 *
 * **Что было (журнал 595).** Экран показывал «Тест пройден / не пройден» и число набранных
 * баллов. Ни процента, ни проходного порога, ни времени прохождения, ни — главное — ответа на
 * вопрос «что дальше». Для регулируемого обучения последнее важнее всего: слушатель после
 * неуда не понимает, потерял ли он обучение целиком.
 *
 * **Порядок блоков — это и есть ответ на «что делать».** Сверху исход, сразу под ним — что
 * дальше и в какой срок. Цифры ниже: они объясняют исход, но решения не меняют. «Написать в
 * учебный центр» — последним и всегда: человек, которому нечего спросить, её не заметит, а
 * тому, кому есть, искать её не придётся.
 */

interface TestResultScreenProps {
  testId: string;
  attemptId: string;
}

export function TestResultScreen({ testId, attemptId }: TestResultScreenProps) {
  const { data: view, isLoading, error } = useAttemptResultView(attemptId || null);
  const { data: attempt } = useAttempt(attemptId || null);
  /* Имя объекта для крошек — название теста: у результата своего имени нет (ТЗ 3.5). */
  const { data: myTests } = useMyTests();
  const testTitle = myTests
    ? (myTests.find((t) => t.testId === testId)?.title ?? 'Тест')
    : undefined;
  useObjectCrumb(testTitle, { failed: Boolean(error) });

  const urgency = view ? dueUrgency(view.retakeDaysLeft) : null;

  return (
    <PageContainer>
      <PageHeader
        title="Результат проверки знаний"
        {...(view?.purposeLabel ? { subtitle: view.purposeLabel } : {})}
      />
      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <SectionError message="Не удалось загрузить результат" />
      ) : !view ? (
        <SectionEmpty
          message="Результата пока нет"
          hint="Он появляется после завершения попытки. Если в проверке есть развёрнутые ответы, итог станет известен после проверки преподавателем."
        />
      ) : (
        <div className="ui-stack">
          <div className={`test-result__banner test-result__banner--${outcomeTone(view.outcome)}`}>
            {/*
              UI-024: значок — иконка набора, а не символ. Здесь он декоративный
              (aria-hidden): рядом стоит заголовок, и дублировать его голосом незачем.
            */}
            <span className="test-result__icon" aria-hidden>
              <Icon icon={view.outcome === 'passed' ? CheckCircleIcon : CircleXIcon} size={24} />
            </span>
            <div>
              <h2 className="test-result__headline">{view.headline}</h2>
              <p className="test-result__score">{scoreSummary(view)}</p>
            </div>
          </div>

          {/*
            «Что дальше» — сразу под исходом и ВЫШЕ цифр. Это единственная часть экрана,
            ради которой человек сюда и пришёл, если проверка не пройдена.
          */}
          <SectionCard title="Что дальше">
            <p
              className={`ui-callout ui-callout--${
                urgency === 'overdue' ? 'danger' : urgency === 'soon' ? 'warning' : 'info'
              }`}
              role={urgency === 'overdue' ? 'alert' : 'status'}
            >
              {view.nextStep}
            </p>
            {view.topicsToRevise.length > 0 ? (
              <>
                <p className="ui-hint">
                  {/*
                    Р9, пункт 4: правильные ответы итоговой проверки не показываются — банк
                    вопросов утечёт за несколько попыток, а по этой проверке выдают документ,
                    который предъявляют инспектору. Тем достаточно, чтобы понять, что
                    повторить.
                  */}
                  Темы, в которых были ошибки:
                </p>
                <ul className="ui-stack" style={{ gap: 4 }}>
                  {view.topicsToRevise.map((topic) => (
                    <li key={topic}>{topic}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </SectionCard>

          <SectionCard title="Как прошла проверка">
            {attempt?.identityVerifiedAt ? (
              <p className="ui-callout ui-callout--success">Личность подтверждена</p>
            ) : null}
            <dl className="ui-kv">
              <div>
                <dt>Набрано</dt>
                <dd>
                  {view.scorePercent}% <span className="ui-text-muted">({view.scoreLine})</span>
                </dd>
              </div>
              <div>
                <dt>Проходной порог</dt>
                <dd>{view.passingPercent}%</dd>
              </div>
              {view.durationText ? (
                <div>
                  <dt>Время прохождения</dt>
                  <dd>{view.durationText}</dd>
                </div>
              ) : null}
              <div>
                <dt>Попыток использовано</dt>
                <dd>
                  {view.attemptsUsed}
                  {view.attemptsLeft === null
                    ? ' (без ограничения)'
                    : view.attemptsLeft > 0
                      ? ` (осталось ${view.attemptsLeft})`
                      : ''}
                </dd>
              </div>
              {view.retakeDueText ? (
                <div>
                  <dt>Повторная проверка</dt>
                  <dd>до {view.retakeDueText}</dd>
                </div>
              ) : null}
            </dl>
          </SectionCard>

          <div className="ui-inline">
            <Link className="ui-button ui-button--primary" href="/learner/tests">
              К моим проверкам
            </Link>
            {/*
              ТЗ 10.4, пункт 5: «Написать в учебный центр». Ведёт в ту же форму обращения,
              что и кнопка «Сообщить о проблеме» (15.5): второй канал означал бы, что половина
              обращений приходит туда, куда центр не смотрит.
            */}
            <Link className="ui-button" href={CONTACT_CENTER_HREF}>
              {CONTACT_CENTER_LABEL}
            </Link>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
