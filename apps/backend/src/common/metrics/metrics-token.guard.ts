import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException
} from '@nestjs/common';

import { backendEnv } from '../../env.js';

/**
 * Доступ к `/metrics` (Фаза 6 Task 5).
 *
 * Метрики отдавались кому угодно без всякой проверки. Это карта нагрузки центра:
 * по ней видно, сколько людей учится, когда идут экзамены, какие ручки тормозят.
 * Наружу такое не отдают.
 *
 * Правило простое: задан `METRICS_TOKEN` — нужен заголовок `Authorization: Bearer <токен>`;
 * не задан — читают свободно (разработка). В production пустой токен запрещён на уровне
 * схемы окружения, поэтому «забыл задать» не превращается в «открыто всем».
 *
 * Сравнение посимвольное с постоянным временем: обычное `===` на строках выходит из
 * сравнения на первом же несовпавшем символе, и по времени ответа токен подбирается.
 */
@Injectable()
export class MetricsTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = backendEnv.METRICS_TOKEN;
    if (!expected) return true;

    const request = context.switchToHttp().getRequest();
    const header: string | undefined = request.header?.('authorization');
    const provided = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';

    if (!provided || !constantTimeEquals(provided, expected)) {
      throw new UnauthorizedException({
        code: 'metrics_token_required',
        message: 'Metrics endpoint requires a valid bearer token'
      });
    }
    return true;
  }
}

function constantTimeEquals(a: string, b: string): boolean {
  // Разная длина — уже несовпадение, но сравниваем всё равно по фиксированной длине,
  // чтобы по времени ответа нельзя было определить длину ожидаемого токена.
  const length = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < length; i += 1) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}
