'use client';

import { apiRequest } from '../api/client';
import { frontendEnv } from '../config/env';

import type { RealtimeEventEnvelope } from '@trudskill/api-contracts';

export type RealtimeHandler = (event: RealtimeEventEnvelope) => void;

/**
 * Окно догона при ПЕРВОМ подключении к комнате: события, которые прилетели прямо
 * перед открытием экрана, всё равно должны доехать.
 */
const INITIAL_REPLAY_WINDOW_MS = 60_000;
/** Пауза перед первой попыткой переподключения; дальше удваивается. */
const RECONNECT_BASE_MS = 2_000;
const RECONNECT_MAX_MS = 30_000;
/**
 * Сколько живое соединение переживает уход последнего подписчика.
 *
 * React снимает эффект и тут же ставит его заново (перерисовка, переход между
 * вкладками одного экрана). Без этой отсрочки каждая такая пересборка рвала бы
 * соединение и открывала новое — с новым запросом истории.
 */
const IDLE_CLOSE_DELAY_MS = 5_000;

interface Channel {
  room: string;
  token: string;
  handlers: Set<RealtimeHandler>;
  source: EventSource | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  idleTimer: ReturnType<typeof setTimeout> | null;
  attempt: number;
  /**
   * Подключение уже начато и ждёт тикет (ТЗ 9.1).
   *
   * Пока подключение было мгновенным, хватало проверки «соединения нет». Теперь между
   * подпиской и открытием потока есть пауза — поход за тикетом, — и за эту паузу успевает
   * прийти второй подписчик. Без этого признака он видел бы «соединения нет» и открывал бы
   * ВТОРОЕ соединение на ту же комнату: ровно тот шторм, от которого лечились в фазе 6.
   */
  connecting: boolean;
  /** SSE-идентификатор последнего доставленного события — точка возобновления. */
  cursor: string | null;
  since: string;
}

/**
 * Клиент живых обновлений (SSE).
 *
 * Соединение принадлежит паре «комната + токен», а не подписчику: сколько бы
 * экранов ни слушало одну комнату, поток один. Это лечит шторм Фазы 6 (дефект A):
 * событие вызывало перерисовку, перерисовка — новую подписку, новая подписка —
 * повтор тех же событий, и круг замыкался сам на себя.
 */
export class RealtimeClient {
  private channels = new Map<string, Channel>();

  subscribe(room: string, token: string, handler: RealtimeHandler) {
    const key = `${room}:${token}`;
    let channel = this.channels.get(key);
    if (!channel) {
      channel = {
        room,
        token,
        handlers: new Set(),
        source: null,
        reconnectTimer: null,
        idleTimer: null,
        attempt: 0,
        connecting: false,
        cursor: null,
        since: new Date(Date.now() - INITIAL_REPLAY_WINDOW_MS).toISOString()
      };
      this.channels.set(key, channel);
    }
    const target = channel;
    target.handlers.add(handler);
    if (target.idleTimer) {
      clearTimeout(target.idleTimer);
      target.idleTimer = null;
    }
    if (!target.source && !target.reconnectTimer && !target.connecting) this.open(key, target);

    let released = false;
    return () => {
      // Повторный вызов отписки не должен уносить соединение у тех, кто ещё слушает.
      if (released) return;
      released = true;
      target.handlers.delete(handler);
      if (target.handlers.size > 0) return;
      // Переиспользовать нечего: соединения нет, висит только отложенное
      // переподключение — гасим сразу, иначе оно откроет поток «в никуда».
      if (!target.source) {
        this.closeChannel(key, target);
        return;
      }
      if (target.idleTimer) clearTimeout(target.idleTimer);
      target.idleTimer = setTimeout(() => this.closeChannel(key, target), IDLE_CLOSE_DELAY_MS);
    };
  }

  private open(key: string, channel: Channel) {
    /*
     * ТЗ 9.1: сперва берём ОДНОРАЗОВЫЙ ТИКЕТ, и только он уходит в адрес.
     *
     * Браузер умеет слушать поток событий только по адресу — заголовки к такому запросу не
     * приложить. Раньше туда клали полный токен доступа, а адрес не секрет: он оседает в
     * журналах веб-сервера, в истории браузера и в заголовке `Referer`, который уходит на
     * чужие сайты. Тикет живёт секунды и сгорает при первом использовании (журнал 571).
     *
     * Тикет берётся на КАЖДОЕ подключение, включая переподключения: прежний уже сгорел.
     */
    void this.openWithTicket(key, channel);
  }

  private async openWithTicket(key: string, channel: Channel) {
    channel.connecting = true;
    let ticket: string;
    try {
      ticket = await this.requestTicket(channel);
    } catch {
      channel.connecting = false;
      /*
       * Тикет не выдали — ведём себя как при обрыве связи: ждём и пробуем снова. Ронять экран
       * нельзя: живые обновления — удобство, а не условие работы; без них страница обновится
       * при переходе.
       */
      this.scheduleReconnect(key, channel);
      return;
    }
    channel.connecting = false;
    // Пока ходили за тикетом, подписчики могли уйти, а канал — закрыться.
    if (this.channels.get(key) !== channel || channel.handlers.size === 0) return;

    const source = new EventSource(this.buildUrl(channel, ticket), { withCredentials: false });
    channel.source = source;
    source.onopen = () => {
      channel.attempt = 0;
    };
    source.onmessage = (message) => {
      // Курсор двигаем раньше разбора: даже нечитаемое событие не должно приехать снова.
      if (message.lastEventId) channel.cursor = message.lastEventId;
      let event: RealtimeEventEnvelope;
      try {
        event = JSON.parse(message.data) as RealtimeEventEnvelope;
      } catch {
        return;
      }
      // Копия набора: обработчик вправе отписаться прямо во время вызова.
      for (const handler of [...channel.handlers]) handler(event);
    };
    source.onerror = () => {
      source.close();
      if (channel.source !== source) return;
      channel.source = null;
      this.scheduleReconnect(key, channel);
    };
  }

  /**
   * Повторить попытку позже, с нарастающей паузой.
   *
   * Вынесено из обработчика ошибки: теперь подключение может не состояться и раньше — на шаге
   * получения тикета, — и ждать в обоих случаях надо одинаково.
   */
  private scheduleReconnect(key: string, channel: Channel) {
    if (this.channels.get(key) !== channel || channel.handlers.size === 0) return;
    if (channel.reconnectTimer) return;
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** channel.attempt, RECONNECT_MAX_MS);
    channel.attempt += 1;
    channel.reconnectTimer = setTimeout(() => {
      channel.reconnectTimer = null;
      if (this.channels.get(key) !== channel || channel.handlers.size === 0) return;
      this.open(key, channel);
    }, delay);
  }

  /** Запросить тикет у сервера. Токен доступа при этом идёт заголовком, а не в адресе. */
  private async requestTicket(channel: Channel): Promise<string> {
    const { ticket } = await apiRequest<{ ticket: string; expiresInSeconds: number }>(
      'auth/realtime-ticket',
      { method: 'POST', body: JSON.stringify({ room: channel.room }) }
    );
    return ticket;
  }

  private buildUrl(channel: Channel, ticket: string) {
    const base = frontendEnv.NEXT_PUBLIC_REALTIME_URL.replace(/^ws:/i, 'http:').replace(
      /^wss:/i,
      'https:'
    );
    const url = new URL(`${base.replace(/\/$/, '')}/stream/${encodeURIComponent(channel.room)}`);
    // Пока не получено ни одного события — просим окно догона. Дальше возобновляем
    // строго после последнего доставленного id: иначе каждое переподключение
    // приносило бы те же события заново.
    if (channel.cursor) url.searchParams.set('cursor', channel.cursor);
    else url.searchParams.set('since', channel.since);
    /* В адрес уходит ТОЛЬКО одноразовый тикет. Токена доступа здесь быть не должно (ТЗ 9.1). */
    url.searchParams.set('ticket', ticket);
    return url.toString();
  }

  private closeChannel(key: string, channel: Channel) {
    if (this.channels.get(key) !== channel) return;
    if (channel.reconnectTimer) clearTimeout(channel.reconnectTimer);
    if (channel.idleTimer) clearTimeout(channel.idleTimer);
    channel.reconnectTimer = null;
    channel.idleTimer = null;
    channel.connecting = false;
    channel.source?.close();
    channel.source = null;
    this.channels.delete(key);
  }
}

export const realtimeClient = new RealtimeClient();
