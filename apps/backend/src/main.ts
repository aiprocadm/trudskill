import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { backendEnv } from './env.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(backendEnv.BACKEND_PORT);
}

void bootstrap();
