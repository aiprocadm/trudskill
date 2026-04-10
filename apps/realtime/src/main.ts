import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';
import { realtimeEnv } from './env.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: { origin: realtimeEnv.CORS_ORIGIN } });
  app.enableShutdownHooks();
  await app.listen(realtimeEnv.REALTIME_PORT);
  process.stdout.write(
    `${JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      service_name: 'realtime',
      environment: realtimeEnv.NODE_ENV,
      version: realtimeEnv.RELEASE_VERSION,
      event_type: 'realtime_bootstrap_complete',
      port: realtimeEnv.REALTIME_PORT
    })}\n`
  );
}

bootstrap().catch((err: unknown) => {
  console.error('Realtime bootstrap failed', err);
  process.exit(1);
});
