'use client';

import { ListPage } from '@trudskill/ui';
import { useEffect, useState } from 'react';

import { describeAction, entityLabel } from './labels';
import { PageContainer, PageHeader } from '../../components/state-wrappers';
import { apiRequest } from '../../lib/api/client';
import { useAuth } from '../auth/context';
import { useUsersList } from '../mvp/hooks';
import { formatDate } from '../mvp/screen-helpers';

type AuditEvent = {
  id: string;
  actorId?: string;
  /** Имя приходит с сервера — экран его не ищет и не додумывает. */
  actorName?: string;
  action: string;
  entityType: string;
  entityId?: string;
  createdAt: string;
};

interface AuditRow {
  id: string;
  whenView: string;
  whoView: string;
  whatView: string;
  overWhatView: string;
}

/*
 * Журнал действий (Фаза 4, срез 18, волна 4). Что изменилось:
 *
 * 1. **Ссылки-обманки.** Под таблицей выводились пять ссылок «Детали события <идентификатор>»,
 *    которые вели на `/workspace` — то есть обещали подробности события и открывали рабочий
 *    стол. Убраны: ссылка, ведущая не туда, хуже отсутствующей.
 * 2. Колонки назывались «Actor», «Action», «Entity», «Entity ID», а значениями стояли коды
 *    (`learning.learner_created`) и идентификаторы. Теперь: кто, что произошло, над чем.
 * 3. Фильтров было восемь в одну строку, пять из них — поля с английскими подсказками
 *    (`actor`, `entity type`, `action`, `entity id`, `request id`). Видимых стало три,
 *    технические (идентификаторы объекта и запроса) уехали под «Ещё фильтры».
 * 4. Первичным действием была кнопка «Обновить» — по `UI-007` обновление не действие.
 *    Журнал грузится сам при открытии и при смене отбора.
 */
export const AuditScreen = () => {
  const { session } = useAuth();
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [actor, setActor] = useState('');
  const [entityId, setEntityId] = useState('');
  const [requestId, setRequestId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<AuditEvent[]>([]);

  /*
   * Ревизия 2026-08-26. Здесь стоял справочник имён на 100 записей, и ненайденный
   * идентификатор превращался в «система». В центре с полутысячей сотрудников журнал
   * приписывал действие человека системе — вранье ровно там, где разбирают спор. Имя
   * теперь приходит с сервера; экран различает три разных случая и ни один не выдаёт
   * за другой: действие системы, действие человека, действие из удалённой учётной записи.
   *
   * Список сотрудников остаётся — но только для отбора «Кто сделал», а не для подстановки
   * имён в строки журнала.
   */
  const { data: users } = useUsersList({ page: 1, page_size: 100 });

  const load = async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams();
      if (actor) query.set('actor', actor);
      if (search) query.set('action', search);
      if (entityId) query.set('entity_id', entityId);
      if (requestId) query.set('request_id', requestId);
      if (from) query.set('created_from', from);
      if (to) query.set('created_to', to);
      const result = await apiRequest<{ items: AuditEvent[] }>(
        `/audit/events?${query.toString()}`,
        {
          auth: {
            accessToken: session.tokens.accessToken,
            tenantId: session.user.tenantId,
            userId: session.user.id
          }
        }
      );
      setRows(result.items);
    } catch (eventError) {
      setError(
        eventError instanceof Error ? eventError.message : 'Не удалось загрузить журнал действий'
      );
    } finally {
      setLoading(false);
    }
  };

  /*
   * Журнал открывается уже заполненным: раньше пустой экран ждал нажатия «Обновить».
   * Перечитывается при смене отбора — `load` намеренно не в зависимостях, иначе каждый
   * рендер создавал бы новую функцию и запрос уходил бы по кругу.
   */
  useEffect(() => {
    void load();
  }, [session, search, from, to, actor, entityId, requestId]);

  /** Три случая, и ни один не выдаётся за другой. */
  const describeActor = (event: AuditEvent) => {
    if (!event.actorId) return 'Система';
    return event.actorName ?? 'Удалённая учётная запись';
  };

  const tableRows: AuditRow[] = rows.map((event) => ({
    id: event.id,
    whenView: formatDate(event.createdAt),
    whoView: describeActor(event),
    whatView: describeAction(event.action),
    overWhatView: entityLabel(event.entityType)
  }));

  const activeCount = [search, from, to, actor, entityId, requestId].filter(Boolean).length;

  return (
    <PageContainer>
      <PageHeader
        title="Журнал действий"
        subtitle="Кто и что менял в системе — записи хранятся и не редактируются"
      />

      <ListPage<AuditRow>
        /*
          ТЗ 5.6 (Э6): панель отбора — слот каркаса, а не отдельный блок рядом. Порядок
          «быстрые отборы → поиск и фильтры → колонки → таблица → массовые действия»
          считает каркас, экран лишь передаёт содержимое.
        */
        filters={
          <>
            <label className="ui-field">
              <span className="ui-field-label">Что искать</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="например, зачисление"
              />
            </label>
            <label className="ui-field">
              <span className="ui-field-label">С даты</span>
              <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            </label>
            <label className="ui-field">
              <span className="ui-field-label">По дату</span>
              <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            </label>
          </>
        }
        secondaryFilters={
          <>
            <label className="ui-field">
              <span className="ui-field-label">Кто сделал</span>
              <select value={actor} onChange={(event) => setActor(event.target.value)}>
                <option value="">Любой сотрудник</option>
                {(users?.items ?? []).map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.displayName}
                  </option>
                ))}
              </select>
            </label>
            {/* Технический отбор — для разбора обращения в поддержку (TXT-004). */}
            <label className="ui-field">
              <span className="ui-field-label">Идентификатор объекта</span>
              <input value={entityId} onChange={(event) => setEntityId(event.target.value)} />
              <p className="ui-field-hint">Нужен, когда разбираетесь с конкретной записью.</p>
            </label>
            <label className="ui-field">
              <span className="ui-field-label">Идентификатор запроса</span>
              <input value={requestId} onChange={(event) => setRequestId(event.target.value)} />
              <p className="ui-field-hint">Его называет сообщение об ошибке.</p>
            </label>
          </>
        }
        activeFilterCount={activeCount}
        onResetFilters={() => {
          setSearch('');
          setFrom('');
          setTo('');
          setActor('');
          setEntityId('');
          setRequestId('');
        }}
        columns={[
          { key: 'whenView', title: 'Когда' },
          { key: 'whoView', title: 'Кто' },
          { key: 'whatView', title: 'Что произошло' },
          { key: 'overWhatView', title: 'Над чем' }
        ]}
        rows={tableRows}
        isLoading={loading}
        error={error ? new Error(error) : undefined}
        onRetry={() => void load()}
        rowKey={(row) => row.id}
        emptyMessage={activeCount > 0 ? 'По этому отбору записей нет' : 'Записей журнала пока нет'}
        emptyHint={
          activeCount > 0
            ? 'Попробуйте расширить период или снять отбор.'
            : 'Сюда попадает каждое изменение: заведение слушателя, выпуск документа, смена прав. Записи не редактируются и не удаляются.'
        }
      />
    </PageContainer>
  );
};
