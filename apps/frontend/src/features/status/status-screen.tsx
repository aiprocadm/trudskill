'use client';

import { useEffect, useState } from 'react';

import {
  PLANNED_MAINTENANCE_NOTE,
  type ServiceState,
  serviceStateOf,
  serviceStatusView
} from './service-status';
import { frontendEnv } from '../../lib/config/env';

/**
 * Публичная страница состояния сервиса (ТЗ «Стабилизация, UX и развитие», 18.3).
 *
 * **Почему без входа.** Смотреть сюда приходят именно тогда, когда войти не получается. Страница
 * состояния, требующая входа, бесполезна ровно в тот момент, ради которого заведена
 * (журнал 586).
 *
 * **Почему не показывает подробностей.** Ни состояния базы, ни длины очередей, ни имён служб:
 * публичная страница состояния — подсказка и посетителю, и тому, кто ищет, за что дёрнуть.
 * Наружу уходит одно из трёх слов и время последней проверки.
 */
export const StatusScreen = () => {
  const [state, setState] = useState<ServiceState | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const probe = async () => {
      try {
        const response = await fetch(`${frontendEnv.NEXT_PUBLIC_API_BASE_URL}/health/ready`, {
          cache: 'no-store'
        });
        /*
         * Тело ответа НЕ разбираем: в нём подробности, которым наружу не место. Достаточно
         * того, ответила ли служба и признала ли себя здоровой.
         */
        if (cancelled) return;
        setState(serviceStateOf({ reachable: true, allHealthy: response.ok }));
      } catch {
        // Не достучались — это и есть ответ «недоступна», а не повод для сообщения об ошибке.
        if (!cancelled) setState(serviceStateOf({ reachable: false }));
      } finally {
        if (!cancelled) setCheckedAt(new Date().toLocaleTimeString('ru-RU'));
      }
    };
    void probe();
    /* Обновляемся сами: человек оставляет эту вкладку открытой и ждёт, когда починят. */
    const timer = setInterval(() => void probe(), 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const view = state ? serviceStatusView(state) : null;

  return (
    <main className="ui-auth-center">
      <article className="ui-section-card ui-auth-card">
        <h1 className="ui-section-title">Состояние системы</h1>

        {view ? (
          <div className="ui-stack">
            <p
              className={`ui-callout ${
                view.state === 'ok'
                  ? 'ui-callout--success'
                  : view.state === 'degraded'
                    ? 'ui-callout--warning'
                    : 'ui-callout--danger'
              }`}
              role="status"
              data-testid="service-state"
            >
              <strong>{view.title}</strong>
            </p>
            <p>{view.what}</p>
            <p className="ui-prose-muted">{view.next}</p>
            {checkedAt ? (
              <p className="ui-text-muted">Проверено в {checkedAt}. Страница обновляется сама.</p>
            ) : null}
          </div>
        ) : (
          <p className="ui-prose-muted">Проверяем…</p>
        )}

        <h2 className="ui-section-title">Плановые работы</h2>
        <p className="ui-prose-muted">{PLANNED_MAINTENANCE_NOTE}</p>
      </article>
    </main>
  );
};
