import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Module,
  Param,
  Post,
  Query,
  Res
} from '@nestjs/common';
import { z } from 'zod';

import { verifySignedAccessToken } from './access-token.util.js';
import { realtimeEnv } from './env.js';
import {
  type RealtimeEventEnvelope,
  type RealtimePubSub,
  RedisRealtimeEventStore,
  RedisRealtimeTicketStore,
  RedisStreamsRealtimePubSub
} from './realtime-backend.js';
import { canAccessRoom } from './room-access.js';
import { parseRealtimeTicket, realtimeTicketKey, ticketMatchesRoom } from './ticket.js';

const roomSchema = z
  .string()
  .regex(/^(user|tenant):[a-zA-Z0-9_-]+$|^(task|dialog|webinar):[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+$/);

type Session = { tenantId: string; userId: string; roles: string[]; sessionId: string };

function extractBearerToken(header?: string): string | undefined {
  if (!header?.startsWith('Bearer ')) return undefined;
  const t = header.slice('Bearer '.length).trim();
  return t || undefined;
}

@Controller()
class RealtimeController {
  constructor(
    @Inject('RealtimePubSub') private readonly realtimePubSub: RealtimePubSub,
    /* ТЗ 9.1: одноразовые тикеты подключения — забираются ровно один раз (журнал 571). */
    @Inject(RedisRealtimeTicketStore) private readonly tickets: RedisRealtimeTicketStore
  ) {}

  @Get('health')
  health() {
    return { status: 'ok', service: 'realtime', timestamp: new Date().toISOString() };
  }

  @Get('ready')
  ready() {
    return { status: 'ready' };
  }

  @Post('publish/:room')
  async publish(
    @Param('room') room: string,
    @Headers('x-realtime-key') key: string,
    @Body() body: RealtimeEventEnvelope
  ) {
    if (key !== realtimeEnv.REALTIME_PUBLISH_KEY) return { accepted: false };
    await this.realtimePubSub.publish(roomSchema.parse(room), body);
    return { accepted: true };
  }

  @Get('stream/:room')
  async stream(
    @Param('room') room: string,
    @Headers('authorization') auth: string | undefined,
    @Query('ticket') ticketQuery: string | undefined,
    @Query('since') since: string | undefined,
    @Query('cursor') cursor: string | undefined,
    @Res()
    res: {
      status: (code: number) => { json: (body: unknown) => void };
      setHeader: (name: string, value: string) => void;
      write: (chunk: string) => void;
      on: (event: 'close', listener: () => void) => void;
    }
  ) {
    const parsedRoom = roomSchema.parse(room);

    /*
     * ТЗ 9.1: в АДРЕСЕ допустим только одноразовый тикет, но не токен доступа.
     *
     * Адрес запроса не секрет — он оседает в журналах веб-сервера, в истории браузера и в
     * заголовке `Referer`, который уходит на чужие сайты. Полный токен оттуда можно взять и
     * работать от имени человека. Тикет живёт секунды и сгорает при первом использовании
     * (журнал 571).
     *
     * Заголовок `Authorization` остаётся: он в адрес не попадает, и служебные клиенты
     * подключаются им. Браузер к потоку событий заголовки приложить не умеет — для него и
     * заведён тикет.
     */
    const headerToken = extractBearerToken(auth);
    const ticket = ticketQuery?.trim();
    if (!headerToken && !ticket) {
      res.status(401).json({ code: 'auth_required', message: 'Access token is required' });
      return;
    }

    let session: Session;
    if (headerToken) {
      try {
        const claims = verifySignedAccessToken(headerToken, realtimeEnv.AUTH_JWT_SECRET);
        session = {
          tenantId: claims.tenant_id,
          userId: claims.sub,
          roles: claims.roles,
          sessionId: claims.session_id
        };
      } catch {
        res
          .status(401)
          .json({ code: 'invalid_token', message: 'Access token is invalid or expired' });
        return;
      }
    } else {
      const payload = parseRealtimeTicket(await this.tickets.take(realtimeTicketKey(ticket!)));
      /*
       * Тикет и комната проверяются вместе: тикет, выданный на свой канал, не должен открывать
       * чужой. Права на саму комнату проверяются ниже — это другой вопрос.
       */
      if (!payload || !ticketMatchesRoom(payload, parsedRoom)) {
        res.status(401).json({
          code: 'invalid_ticket',
          message: 'Ticket is invalid, expired or already used'
        });
        return;
      }
      session = {
        tenantId: payload.tenantId,
        userId: payload.userId,
        roles: payload.roles,
        sessionId: payload.sessionId
      };
    }

    if (!this.canAccess(session, parsedRoom)) {
      res.status(403).json({ code: 'forbidden', message: 'Forbidden room access' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let currentCursor = cursor;
    const send = async () => {
      const events = await this.realtimePubSub.read(parsedRoom, {
        ...(since ? { since } : {}),
        ...(currentCursor ? { cursor: currentCursor } : {}),
        limit: realtimeEnv.REALTIME_STREAM_READ_BATCH
      });

      for (const event of events) {
        currentCursor = event.cursor;
        res.write(`id: ${event.cursor}\n`);
        res.write(`data: ${JSON.stringify(event.event)}\n\n`);
      }

      res.write(
        `event: heartbeat\ndata: ${JSON.stringify({ ts: new Date().toISOString(), cursor: currentCursor ?? null })}\n\n`
      );
    };

    await send();
    const timer = setInterval(() => {
      void send();
    }, 5000);
    res.on('close', () => clearInterval(timer));
  }

  /** Правило доступа вынесено чистой функцией и покрыто тестами (порция 36, журнал 282). */
  private canAccess(session: Session, room: string): boolean {
    return canAccessRoom(session, room);
  }
}

@Module({
  controllers: [RealtimeController],
  providers: [
    RedisRealtimeEventStore,
    RedisRealtimeTicketStore,
    RedisStreamsRealtimePubSub,
    { provide: 'RealtimePubSub', useExisting: RedisStreamsRealtimePubSub }
  ]
})
export class AppModule {}
