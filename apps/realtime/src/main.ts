import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { realtimeEnv } from './env.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(realtimeEnv.REALTIME_PORT);
}

void bootstrap();
