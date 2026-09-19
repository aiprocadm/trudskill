import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { IsString, MaxLength, MinLength } from 'class-validator';

import { buildProblemReport } from './problem-report.js';
import { assertValidDto } from '../../common/app-validation.pipe.js';
import { CurrentContext } from '../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { backendEnv } from '../../env.js';
import { AuditService } from '../audit/audit.service.js';

import type { RequestContext } from '../../common/context/request-context.js';

/** Тело обращения. Всё остальное подставляет сервер — см. `problem-report.ts`. */
export class ProblemReportRequestDto {
  /**
   * Нижняя граница не придирка: «не работает» без продолжения не даёт дежурному ничего, и
   * обращение всё равно вернётся вопросом «а что именно?» — только через день.
   */
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  text!: string;

  /** Адрес страницы; сервер всё равно чистит его повторно — клиенту доверять нельзя. */
  @IsString()
  @MaxLength(500)
  page!: string;
}

/**
 * Приём обращений «Сообщить о проблеме» (ТЗ 15.5).
 *
 * **Куда попадает обращение.** В журнал аудита — туда же, куда всё остальное, что нужно уметь
 * найти потом. Отдельного хранилища обращений не заводится: это была бы вторая сущность с теми
 * же свойствами (есть автор, есть время, ищется по человеку и по дате), а журнал уже умеет всё
 * это и переживает перезапуски.
 *
 * **Без права, намеренно.** Сообщить о проблеме должен мочь любой вошедший, включая слушателя,
 * — именно у него чаще всего что-то не открывается, и именно он не дозвонится в центр вечером.
 * Ограничение по праву превратило бы кнопку в украшение для избранных.
 */
@Controller()
@UseGuards(TenantGuard)
export class SupportController {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  /**
   * Частота ограничена: обращение пишут раз в несколько минут, а не в цикле. Пять в минуту —
   * с запасом на «нажал ещё раз, потому что показалось, что не отправилось».
   */
  @Post('support/problem-reports')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async report(@CurrentContext() context: RequestContext, @Body() raw: unknown) {
    const payload = assertValidDto(ProblemReportRequestDto, raw);
    const record = buildProblemReport(
      payload,
      { ...(context.roles ? { roles: context.roles } : {}), requestId: context.requestId },
      backendEnv.RELEASE_VERSION ?? ''
    );

    await this.audit.writeCritical({
      tenantId: context.tenantId!,
      actorId: context.userId,
      action: 'support.problem_reported',
      entityType: 'support.problem_report',
      entityId: record.requestId,
      metadata: {
        page: record.page,
        role: record.role,
        release: record.release,
        text: record.text
      },
      requestId: context.requestId,
      correlationId: context.correlationId,
      ip: context.ip,
      userAgent: context.userAgent
    });

    /*
     * Возвращаем номер, чтобы человек мог его назвать. Это то же число, которое видно в логах
     * и на экране ошибки, — по нему дежурный находит ровно этот случай.
     */
    return { requestId: record.requestId };
  }
}
