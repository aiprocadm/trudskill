'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LoadingState } from '@trudskill/ui';
import { useState } from 'react';

import { esignatureApi } from './api';
import { SectionCard, SectionError } from '../../components/state-wrappers';
import { useAuth } from '../auth/context';

import type { PropsWithChildren } from 'react';

/**
 * Экран принятия соглашения об электронном взаимодействии (ФТ-C1.1, Фаза 3 Task 4).
 *
 * Показывается вместо содержимого страницы, когда центр опубликовал соглашение, а
 * пользователь его ещё не принял (или текст изменился). Именно «вместо», а не поверх:
 * с момента принятия действия пользователя считаются подписанными ПЭП, поэтому дать
 * ему поработать «пока не подписал» — значит собрать неподписанные действия.
 *
 * Пока статус не загружен, содержимое НЕ прячем: иначе моргание экрана на каждом
 * переходе и полная неработоспособность при недоступном бэкенде. Отказ запроса тоже
 * не блокирует работу — блокировать вход из-за сбоя проверки хуже, чем пропустить.
 */
export function AgreementGate({ children }: PropsWithChildren) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const statusQuery = useQuery({
    queryKey: ['esignature-status', session?.user.id],
    enabled: Boolean(session),
    queryFn: () => esignatureApi.status(session!)
  });

  const agreementQuery = useQuery({
    queryKey: ['esignature-agreement', session?.user.id],
    enabled: Boolean(session) && statusQuery.data?.acceptanceRequired === true,
    queryFn: () => esignatureApi.agreement(session!)
  });

  if (!session || !statusQuery.data?.acceptanceRequired) return <>{children}</>;

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      await esignatureApi.accept(session);
      await queryClient.invalidateQueries({ queryKey: ['esignature-status'] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось принять соглашение');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard title="Соглашение об электронном взаимодействии">
      <p className="ui-text-muted">
        С момента принятия ваши отметки «Ознакомлен», ответы на тесты и заявления считаются
        подписанными простой электронной подписью. Фиксируются дата, время, адрес и устройство.
      </p>
      {error ? <SectionError message={error} /> : null}
      {agreementQuery.isLoading ? <LoadingState message="Загружаем текст…" /> : null}
      {agreementQuery.data?.body ? (
        <pre className="ui-agreement-body" data-testid="agreement-body">
          {agreementQuery.data.body}
        </pre>
      ) : null}
      <button type="button" onClick={() => void accept()} disabled={busy}>
        {busy ? 'Принимаем…' : 'Принимаю соглашение'}
      </button>
    </SectionCard>
  );
}
