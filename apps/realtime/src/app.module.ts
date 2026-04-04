import { Body, Controller, Get, Headers, Module, Param, Post, Query, Res } from '@nestjs/common';
import { z } from 'zod';
import { verifySignedAccessToken } from './access-token.util.js';
import { realtimeEnv } from './env.js';

type RealtimeEventName =
  | 'async_task.status_changed'
  | 'notification.created'
  | 'notification.read'
  | 'chat.message.created'
  | 'dialog.updated'
  | 'unread.changed'
  | 'webinar.updated';

type RealtimeEventEnvelope<TPayload = unknown> = {
  event_name: RealtimeEventName;
  version: 'v1';
  tenant_id: string;
  occurred_at: string;
  correlation_id?: string;
  payload: TPayload;
};

const roomSchema = z.string().regex(/^(user|tenant|task|dialog|webinar):[a-zA-Z0-9_-]+$/);

type Session = { tenantId: string; userId: string; roles: string[]; sessionId: string };

function extractBearerToken(header?: string): string | undefined {
  if (!header?.startsWith('Bearer ')) return undefined;
  const t = header.slice('Bearer '.length).trim();
  return t || undefined;
}

class RealtimeHub {
  private roomEvents = new Map<string, RealtimeEventEnvelope[]>();

  publish(room: string, event: RealtimeEventEnvelope) {
    const current = this.roomEvents.get(room) ?? [];
    current.push(event);
    this.roomEvents.set(room, current.slice(-500));
  }

  get(room: string, since?: string) {
    const events = this.roomEvents.get(room) ?? [];
    return since ? events.filter((item) => item.occurred_at > since) : events;
  }
}

@Controller()
class RealtimeController {
  constructor(private readonly hub: RealtimeHub) {}

  @Get('health')
  health() {
    return { status: 'ok', service: 'realtime', timestamp: new Date().toISOString() };
  }

  @Get('ready')
  ready() {
    return { status: 'ready' };
  }

  @Post('publish/:room')
  publish(@Param('room') room: string, @Headers('x-realtime-key') key: string, @Body() body: RealtimeEventEnvelope) {
    if (key !== realtimeEnv.REALTIME_PUBLISH_KEY) return { accepted: false };
    this.hub.publish(roomSchema.parse(room), body);
    return { accepted: true };
  }

  @Get('stream/:room')
  stream(
    @Param('room') room: string,
    @Headers('authorization') auth: string | undefined,
    @Query('access_token') accessTokenQuery: string | undefined,
    @Query('since') since: string | undefined,
    @Res() res: { status: (code: number) => { json: (body: unknown) => void }; setHeader: (name: string, value: string) => void; write: (chunk: string) => void; on: (event: 'close', listener: () => void) => void }
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
      res.status(401).json({ code: 'invalid_token', message: 'Access token is invalid or expired' });
      return;
    }

    if (!this.canAccess(session, parsedRoom)) {
      res.status(403).json({ code: 'forbidden', message: 'Forbidden room access' });
      return;
    }
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    const send = () => {
      this.hub.get(parsedRoom, since).forEach((event) => res.write(`data: ${JSON.stringify(event)}\n\n`));
      res.write(`event: heartbeat\ndata: ${JSON.stringify({ ts: new Date().toISOString() })}\n\n`);
    };
    send();
    const timer = setInterval(send, 5000);
    res.on('close', () => clearInterval(timer));
  }

  private canAccess(session: Session, room: string): boolean {
    const [type, id = ''] = room.split(':');
    if (!session.tenantId || !session.userId) return false;
    if (type === 'tenant') return id === session.tenantId;
    if (type === 'user') return id === session.userId;
    return id.startsWith(session.tenantId) || session.roles.includes('admin');
  }
}


@Module({ controllers: [RealtimeController], providers: [RealtimeHub] })
export class AppModule {}

