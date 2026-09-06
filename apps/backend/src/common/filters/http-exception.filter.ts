import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
  Logger
} from '@nestjs/common';
import { BackendHttpErrorCodes, httpErrorCodeForStatus } from '@trudskill/api-contracts';

import { backendEnv } from '../../env.js';
import { resolveRequestContext } from '../utils/request.js';

import type { Response } from 'express';

const describeUnknownException = (exception: unknown): string => {
  if (
    typeof AggregateError !== 'undefined' &&
    exception instanceof AggregateError &&
    exception.errors?.length
  ) {
    return exception.errors.map((e) => describeUnknownException(e)).join('; ');
  }
  if (exception instanceof Error) {
    let message = exception.message;
    if (exception.cause instanceof Error) {
      message = `${message} (cause: ${exception.cause.message})`;
    }
    return message;
  }
  return typeof exception === 'string' ? exception : JSON.stringify(exception);
};

const infraFailureLikely = (detail: string): boolean =>
  /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|password authentication failed|database .*does not exist|relation .*does not exist|no pg_hba/i.test(
    detail
  );

/** Non-production: клиент может увидеть детали; в production только безопасные тексты для типичных infra-сбоев */
const INTERNAL_ERROR_FALLBACK_MESSAGE = 'Unexpected server error';
/**
 * Ревизия 2026-08-26. Здесь стоял единственный текст — по-английски и с инструкцией
 * «docker compose up postgres». В разработке это полезно, а в продакшене уходило
 * пользователю: администратор учебного центра докер не запускает, зато из подсказки узнаёт,
 * на чём мы работаем и как называется наша переменная окружения.
 *
 * Теперь текстов два: разработчику — прежняя подсказка, человеку — что произошло и что
 * делать. Подробности в обоих случаях остаются в журнале.
 */
const DATABASE_UNAVAILABLE_DEV_MESSAGE =
  'Database unavailable: ensure PostgreSQL is running (e.g. docker compose up postgres) and DATABASE_URL matches your instance.';
const SERVICE_UNAVAILABLE_MESSAGE =
  'Сервис временно недоступен — данные не потеряны. Повторите через несколько минут; если не поможет, передайте администратору номер запроса.';

@Injectable()
@Catch()
export class HttpExceptionEnvelopeFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionEnvelopeFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();
    const requestContext = resolveRequestContext(request);

    let status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    /*
     * Ревизия 2026-09-06. Тело исключения приходит сюда в двух видах. Наш — объектная форма
     * `{ code, message }` (правило CLAUDE.md). Чужой — то, что Nest делает из строки:
     * `{ message, error: 'Bad Request', statusCode: 400 }`, без кода. Так бросает сам Nest
     * (404 на несуществующий адрес, 413 на слишком большое тело), и так бросали 49 наших
     * мест до этой ревизии.
     *
     * Тело без кода уходило в конверт как есть. Фронт кода не находил и подставлял
     * `internal_error`, а словарь отвечал на него «Сбой на стороне сервера — с вашими
     * данными ничего не случилось. Повторите через минуту». Человек повторял, и повторялось
     * то же самое: сервер был исправен, а мешало состояние записи или его собственный ввод.
     *
     * Поэтому код проставляется здесь — это последнее место, через которое проходит любая
     * ошибка, включая те, что бросили не мы. Служебные поля Nest (`error`, `statusCode`)
     * в конверт не идут: статус человек и так получает, а `'Bad Request'` ему не адресовано.
     */
    const normalizeHttpPayload = (
      value: string | object,
      httpStatus: number
    ): Record<string, unknown> => {
      const fallbackCode = httpErrorCodeForStatus(httpStatus);
      if (typeof value === 'string') {
        return { code: fallbackCode, message: value };
      }
      const body = value as Record<string, unknown>;
      if (typeof body.code === 'string' && body.code) {
        return body;
      }
      const { message } = body;
      // `message` у Nest бывает списком — так отвечает штатный ValidationPipe.
      const text = Array.isArray(message)
        ? message.map((part) => String(part)).join('; ')
        : typeof message === 'string' && message
          ? message
          : INTERNAL_ERROR_FALLBACK_MESSAGE;
      // Служебные `error` и `statusCode` Nest в конверт не переносятся — остальное переносится.
      const carried = Object.fromEntries(
        Object.entries(body).filter(([key]) => !['message', 'error', 'statusCode'].includes(key))
      );
      return { ...carried, code: fallbackCode, message: text };
    };

    let payload: Record<string, unknown> =
      exception instanceof HttpException
        ? normalizeHttpPayload(exception.getResponse(), status)
        : {
            code: BackendHttpErrorCodes.internal_error,
            message: INTERNAL_ERROR_FALLBACK_MESSAGE
          };

    if (!(exception instanceof HttpException)) {
      const detail = describeUnknownException(exception);
      const infra = infraFailureLikely(detail);
      if (infra) {
        status = HttpStatus.SERVICE_UNAVAILABLE;
      }
      const devDetail = backendEnv.NODE_ENV === 'development';
      payload = {
        code: BackendHttpErrorCodes.internal_error,
        message: devDetail
          ? infra
            ? DATABASE_UNAVAILABLE_DEV_MESSAGE
            : detail
          : infra
            ? SERVICE_UNAVAILABLE_MESSAGE
            : INTERNAL_ERROR_FALLBACK_MESSAGE
      };
    }

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      if (exception instanceof Error) {
        this.logger.error(`${exception.constructor.name}: ${exception.message}`, exception.stack);
        if (
          typeof AggregateError !== 'undefined' &&
          exception instanceof AggregateError &&
          exception.errors?.length
        ) {
          this.logger.error(`Aggregate errors: ${describeUnknownException(exception)}`);
        }
      } else {
        this.logger.error(String(exception));
      }
    }

    response.status(status).json({
      error: payload,
      meta: {
        requestId: requestContext.requestId,
        correlationId: requestContext.correlationId,
        timestamp: new Date().toISOString()
      }
    });
  }
}
