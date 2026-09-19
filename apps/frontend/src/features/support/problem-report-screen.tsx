'use client';

import { PageContainer, PageHeader, SectionCard } from '@trudskill/ui';
import { useState } from 'react';

import {
  PROBLEM_REPORT_LABEL,
  PROBLEM_REPORT_MAX,
  problemReportError,
  safePage
} from './problem-report';
import { apiRequest } from '../../lib/api/client';

/**
 * Экран «Сообщить о проблеме» (ТЗ «Стабилизация, UX и развитие», 15.5).
 *
 * **Зачем это дешевле поддержки по телефону.** Человек, у которого что-то не работает, обычно
 * не может объяснить, что именно: «не открывается», «выдало ошибку», «всё пропало». Разговор
 * уходит на выяснение, где он был и что нажимал, и половина сведений теряется — человек уже
 * ушёл с той страницы.
 *
 * **Что прикладывается и КЕМ.** Роль, версию системы и номер запроса подставляет СЕРВЕР: он
 * знает их точно, а присланное клиентом можно подделать — и тогда контекст в обращении
 * бесполезен. От экрана уходит только описание и адрес страницы, где человек находился
 * (журнал 583).
 *
 * **Чего здесь намеренно НЕТ.** Ни снимка экрана, ни содержимого полей, ни списка последних
 * действий. На экранах этой системы почти всегда персональные данные слушателей: ФИО, СНИЛС,
 * паспортные фотографии. Обращение в поддержку не должно превращаться в канал их утечки — а
 * именно этим оборачивается «приложим побольше на всякий случай».
 */
export const ProblemReportScreen = () => {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sentRequestId, setSentRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const page = safePage(typeof window === 'undefined' ? undefined : window.location.pathname);

  const send = async () => {
    const problem = problemReportError(text);
    if (problem) {
      setError(problem);
      return;
    }
    setSending(true);
    setError(null);
    try {
      const result = await apiRequest<{ requestId: string }>('support/problem-reports', {
        method: 'POST',
        body: JSON.stringify({ text: text.trim(), page })
      });
      setSentRequestId(result.requestId);
    } catch (sendError) {
      /*
       * Отдельный текст, а не общий «ошибка»: человек уже в плохой ситуации, и сообщение «не
       * получилось сообщить о том, что не получается» без подсказки — издевательство.
       */
      setError(
        sendError instanceof Error
          ? `Не удалось отправить: ${sendError.message} Скопируйте текст и передайте администратору учебного центра.`
          : 'Не удалось отправить. Скопируйте текст и передайте администратору учебного центра.'
      );
    } finally {
      setSending(false);
    }
  };

  if (sentRequestId) {
    return (
      <PageContainer>
        <PageHeader title={PROBLEM_REPORT_LABEL} />
        <SectionCard title="Обращение отправлено">
          <p>
            Мы записали, что произошло, и приложили сведения о странице, вашей роли и версии
            системы. Если понадобится уточнение — с вами свяжутся.
          </p>
          <p className="ui-text-muted">
            Номер обращения: {sentRequestId}. Назовите его, если будете звонить в центр.
          </p>
        </SectionCard>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={PROBLEM_REPORT_LABEL}
        subtitle="Опишите, что вы делали и что увидели вместо ожидаемого. Остальное система приложит сама."
      />
      <SectionCard title="Что случилось">
        <label className="ui-field" htmlFor="problem-text">
          <span className="ui-field-label">Описание</span>
          <textarea
            id="problem-text"
            className="ui-input"
            rows={6}
            maxLength={PROBLEM_REPORT_MAX}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              if (error) setError(null);
            }}
            aria-invalid={Boolean(error)}
            {...(error ? { 'aria-describedby': 'problem-text-error' } : {})}
          />
        </label>
        {error ? (
          <p id="problem-text-error" className="ui-callout ui-callout--danger" role="alert">
            {error}
          </p>
        ) : null}

        {/*
          Показываем, ЧТО уходит вместе с обращением. Отправлять что-то «в фоне», не показав
          что, — верный способ, чтобы кнопкой перестали пользоваться, как только кто-то один
          заглянет в отправляемое.
        */}
        <p className="ui-text-muted">Вместе с обращением отправится:</p>
        <ul data-testid="problem-context">
          <li>страница, на которой вы были: {page}</li>
          <li>ваша роль и версия системы — их подставит сервер</li>
          <li>номер обращения, чтобы его можно было найти</li>
        </ul>

        <button
          type="button"
          className="ui-button ui-button--primary"
          disabled={sending}
          onClick={() => void send()}
        >
          {sending ? 'Отправляем…' : 'Отправить обращение'}
        </button>
      </SectionCard>
    </PageContainer>
  );
};
