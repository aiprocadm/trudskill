import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';
import { createAppValidationPipe } from './common/app-validation.pipe.js';
import { HttpExceptionEnvelopeFilter } from './common/filters/http-exception.filter.js';
import { RequestContextInterceptor } from './common/interceptors/request-context.interceptor.js';
import { RequestObservabilityInterceptor } from './common/interceptors/request-observability.interceptor.js';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor.js';
import { createSecurityHeadersMiddleware } from './common/security/security-headers.js';
import { backendEnv } from './env.js';
import { installCrashLog } from './infrastructure/observability/crash-log.js';

/*
 * Причина падения — в файл (ТЗ 1.2). Ставится ДО поднятия приложения: сбой при самом старте
 * тоже обязан оставить след. Системный журнал у служб есть, но читать его может только член
 * групп `adm` / `systemd-journal` — владельцу он недоступен (см. docs/ops/stand.md).
 */
installCrashLog(backendEnv.CRASH_LOG_FILE);

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    cors: { origin: backendEnv.CORS_ORIGIN, credentials: true }
  });
  /*
   * ФТ-G7 — заголовки безопасности. Ставятся ДО всего остального, чтобы попасть и в ответы
   * об ошибке, и в запросы, до контроллера не дошедшие: страница ошибки уходит в тот же
   * браузер и защищена быть обязана.
   */
  app.use(createSecurityHeadersMiddleware(backendEnv.NODE_ENV === 'production'));
  app.useGlobalPipes(createAppValidationPipe());
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

bootstrap().catch((err: unknown) => {
  console.error('Backend bootstrap failed', err);
  process.exit(1);
});
