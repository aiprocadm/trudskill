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
  RedisStreamsRealtimePubSub
} from './realtime-backend.js';

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
  constructor(@Inject('RealtimePubSub') private readonly realtimePubSub: RealtimePubSub) {}

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
    @Query('access_token') accessTokenQuery: string | undefined,
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
    const rawToken = extractBearerToken(auth) ?? accessTokenQuery?.trim();
    if (!rawToken) {
      res.status(401).json({ code: 'auth_required', message: 'Access token is required' });
      return;
    }

    let session: Session;
    try {
      const claims = verifySignedAccessToken(rawToken, realtimeEnv.AUTH_JWT_SECRET);
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

  private canAccess(session: Session, room: string): boolean {
    if (!session.tenantId || !session.userId) return false;
    const parts = room.split(':');
    const type = parts[0];
    if (type === 'tenant') return parts[1] === session.tenantId;
    if (type === 'user') return parts[1] === session.userId;
    if (type === 'task' || type === 'dialog' || type === 'webinar') {
      const tenantInRoom = parts[1];
      return Boolean(tenantInRoom && tenantInRoom === session.tenantId);
    }
    return false;
  }
}

@Module({
  controllers: [RealtimeController],
  providers: [
    RedisRealtimeEventStore,
    RedisStreamsRealtimePubSub,
    { provide: 'RealtimePubSub', useExisting: RedisStreamsRealtimePubSub }
  ]
})
export class AppModule {}
