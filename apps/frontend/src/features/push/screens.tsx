'use client';

import { usePushSubscription } from './hooks';
import { SectionCard, SectionEmpty, SectionError } from '../../components/state-wrappers';
import { useAuth } from '../auth/context';

import type { ReactElement } from 'react';

/**
 * Phase 10 Track C — push subscription settings section. Hidden (SectionEmpty) when push is
 * unavailable: either the browser lacks support or the administrator has not enabled it
 * (GET /web-push/public-key → enabled:false). Otherwise a toggle to subscribe/unsubscribe the
 * current browser. Self-service: any authenticated user.
 */
export function PushSettingsScreen(): ReactElement {
  const { session } = useAuth();
  const push = usePushSubscription(session);

  if (!push.supported) {
    return (
      <SectionCard title="Уведомления на телефон">
        <SectionEmpty
          message="Уведомления на устройство недоступны"
          hint="Их либо не включил администратор центра, либо не поддерживает ваш браузер. Письма на почту приходят как обычно."
        />
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Уведомления на телефон и компьютер">
      <p>
        Получайте уведомления о записи на курс, завершении обучения, переаттестации и сроках прямо в
        браузере — даже когда вкладка закрыта.
      </p>
      {push.permission === 'denied' ? (
        <SectionEmpty
          message="Уведомления заблокированы"
          hint="Разрешите уведомления для этого сайта в настройках браузера, затем повторите."
        />
      ) : push.isSubscribed ? (
        <button type="button" onClick={() => void push.unsubscribe()} disabled={push.loading}>
          {push.loading ? 'Отключаем…' : 'Отключить уведомления'}
        </button>
      ) : (
        <button type="button" onClick={() => void push.subscribe()} disabled={push.loading}>
          {push.loading ? 'Включаем…' : 'Включить уведомления'}
        </button>
      )}
      {push.error ? <SectionError message={push.error} /> : null}
    </SectionCard>
  );
}
