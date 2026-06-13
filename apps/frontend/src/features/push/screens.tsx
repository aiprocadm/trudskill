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
      <SectionCard title="Push-уведомления">
        <SectionEmpty
          message="Push-уведомления недоступны"
          hint="Не настроены администратором или не поддерживаются вашим браузером."
        />
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Push-уведомления">
      <p style={{ marginTop: 0 }}>
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
          {push.loading ? 'Отключаем…' : 'Отключить push-уведомления'}
        </button>
      ) : (
        <button type="button" onClick={() => void push.subscribe()} disabled={push.loading}>
          {push.loading ? 'Включаем…' : 'Включить push-уведомления'}
        </button>
      )}
      {push.error ? <SectionError message={push.error} /> : null}
    </SectionCard>
  );
}
