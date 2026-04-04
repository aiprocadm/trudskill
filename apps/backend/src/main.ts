import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { HttpExceptionEnvelopeFilter } from './common/filters/http-exception.filter.js';
import { RequestContextInterceptor } from './common/interceptors/request-context.interceptor.js';
import { RequestObservabilityInterceptor } from './common/interceptors/request-observability.interceptor.js';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor.js';
import { backendEnv } from './env.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: { origin: backendEnv.CORS_ORIGIN } });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: false,
      forbidNonWhitelisted: true
    })
  );
  app.useGlobalFilters(new HttpExceptionEnvelopeFilter());
  app.useGlobalInterceptors(
    new RequestContextInterceptor(),
    app.get(RequestObservabilityInterceptor),
    new ResponseEnvelopeInterceptor()
  );
  app.setGlobalPrefix(backendEnv.API_PREFIX.replace(/^\//, ''));
  app.enableShutdownHooks();
  await app.listen(backendEnv.BACKEND_PORT);
}

void bootstrap();
