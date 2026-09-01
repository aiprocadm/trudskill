import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron } from '@nestjs/schedule';

import { DocumentsTenantRunner } from './documents-tenant-runner.service.js';
import { findMissedIssuance } from './missed-issuance.finder.js';
import { declareScheduler, recordSchedulerRun } from '../../common/metrics/scheduler-heartbeat.js';
import { DatabaseService } from '../../infrastructure/database/database.service.js';
import { ENROLLMENT_COMPLETED_EVENT } from '../mvp/enrollment-completed.event.js';
import { buildEnrollmentCompletedPayload } from '../mvp/enrollment-completed.payload.js';
import { MvpTenantRunner } from '../mvp/infrastructure/mvp-tenant-runner.service.js';
import { TenantService } from '../tenant/tenant.service.js';

import type { CompletedEnrollmentView } from './missed-issuance.finder.js';
import type { EnrollmentCompletedPayload } from '../mvp/enrollment-completed.event.js';

/**
 * Занятые ключи замков: 528_491 напоминания, 528_492 хранение подтверждений личности,
 * 528_493 просроченные попытки, 528_494 счета за аренду, 528_495 видеозаписи экзаменов,
 * 528_497 зависшие задачи, 528_499 общая уборка по срокам, 528_501 миграции.
 */
const MISSED_ISSUANCE_LOCK_KEY = 528_496;

/** Сколько ждать после завершения, прежде чем считать выпуск потерянным. */
const ISSUANCE_GRACE_MS = 30 * 60 * 1000;

/**
 * Ревизия 2026-08-27 (порция 37, журнал 273) — добор невыпущенных документов.
 *
 * **Что было не так.** Выпуск при завершении обучения держится на событии ВНУТРИ процесса.
 * Перезапуск в этот момент (выкатка, сбой, нехватка памяти) уносит событие с собой:
 * повторить его некому, ошибки нет, в журнале тишина. Слушатель ждёт удостоверение,
 * администратор уверен, что оно выдано, и узнают об этом в худший момент — на проверке.
 *
 * **Почему не через `core.outbox_events`.** Механизм надёжной доставки в проекте построен
 * целиком — таблица, рассыльщик, метрика в состоянии здоровья, — но в него не пишет никто.
 * Подключить его для одного случая нельзя «походя»: выпуск пришлось бы переносить в
 * очередь и в воркер, то есть менять архитектуру. Добор дешевле и честнее: он не делает
 * вид, что доставка стала надёжной, а просто НАХОДИТ пропущенное и повторяет.
 *
 * **Почему повтор безопасен.** Выпуск идемпотентен (durable-dedup внутри `generateDocument`),
 * поэтому повторное событие не задваивает документы. Из-за этого же добор может позволить
 * себе грубость: лучше лишний раз проверить, чем пропустить.
 */
@Injectable()
export class MissedIssuanceSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(MissedIssuanceSchedulerService.name);

  /**
   * Объявляем планировщик при старте (журнал 327): до этого отметка появлялась только
   * после первого прогона, и «не тот cron / не взялся замок / выключен» выглядели как
   * ОТСУТСТВИЕ метрики — тревогу на такое не напишешь.
   */
  onModuleInit(): void {
    declareScheduler('missed-issuance-sweep', {
      expectedIntervalMs: 60 * 60 * 1000,
      enabled: true
    });
  }

  constructor(
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(MvpTenantRunner) private readonly mvpRunner: MvpTenantRunner,
    @Inject(DocumentsTenantRunner) private readonly documentsRunner: DocumentsTenantRunner,
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(EventEmitter2) private readonly events: EventEmitter2
  ) {}

  /** Раз в час: потерянный выпуск не горит минутами, но и висеть сутками не должен. */
  @Cron('23 * * * *', { name: 'missed-issuance-sweep', timeZone: 'UTC' })
  async handleSweep(): Promise<void> {
    try {
      await this.runSweepAllTenants(Date.now());
      recordSchedulerRun('missed-issuance-sweep', 'ok', { expectedIntervalMs: 60 * 60 * 1000 });
    } catch (err) {
      recordSchedulerRun('missed-issuance-sweep', 'error', { expectedIntervalMs: 60 * 60 * 1000 });
      this.logger.error(
        `Missed issuance sweep failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  async runSweepAllTenants(nowMs: number): Promise<number> {
    let totalRetried = 0;
    await this.db.withTransaction(async (client) => {
      const lockRows = await this.db.query<{ locked: boolean }>(
        'select pg_try_advisory_xact_lock($1) as locked',
        [MISSED_ISSUANCE_LOCK_KEY],
        client
      );
      if (!lockRows[0]?.locked) {
        this.logger.log('Another instance holds the missed-issuance lock; skipping.');
        return;
      }
      for (const tenantId of await this.tenants.listActiveTenantIds()) {
        try {
          totalRetried += await this.sweepTenant(tenantId, nowMs);
        } catch (err) {
          // Сбой на одном центре не должен прерывать обход остальных.
          this.logger.error(
            `Missed issuance sweep failed for tenant ${tenantId}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    });
    return totalRetried;
  }

  private async sweepTenant(tenantId: string, nowMs: number): Promise<number> {
    // Состояние центра читаем БЕЗ сохранения: добор ничего в нём не меняет, он только
    // повторяет событие — а запись снимка ради чтения затирала бы чужие правки.
    const { views, payloads } = await this.mvpRunner.runWithTenantState(tenantId, async (state) => {
      const completedViews: CompletedEnrollmentView[] = [];
      const payloadById = new Map<string, EnrollmentCompletedPayload>();
      for (const enrollment of state.enrollments) {
        if (enrollment.tenantId !== tenantId || enrollment.status !== 'completed') continue;
        const payload = buildEnrollmentCompletedPayload(state, tenantId, enrollment);
        const autoIssueTemplateIds = (payload.documentSet ?? [])
          .filter((entry) => entry.autoIssueOnCompletion)
          .map((entry) => entry.templateId);
        completedViews.push({
          enrollmentId: enrollment.id,
          autoIssueTemplateIds,
          ...(enrollment.completedAt ? { completedAt: enrollment.completedAt } : {})
        });
        payloadById.set(enrollment.id, payload);
      }
      return { views: completedViews, payloads: payloadById };
    });

    if (views.every((view) => view.autoIssueTemplateIds.length === 0)) return 0;

    const issued = await this.documentsRunner.runWithTenantDocuments(tenantId, async (documents) =>
      documents
        .listDocuments(tenantId, {
          sourceEntityType: 'enrollment',
          pageSize: Number.MAX_SAFE_INTEGER
        })
        .items.map((document) => ({
          sourceEntityType: document.sourceEntityType,
          ...(document.sourceEntityId ? { sourceEntityId: document.sourceEntityId } : {}),
          ...(document.templateId ? { templateId: document.templateId } : {})
        }))
    );

    const missed = findMissedIssuance({
      completed: views,
      issued,
      nowMs,
      graceMs: ISSUANCE_GRACE_MS
    });

    for (const enrollmentId of missed) {
      const payload = payloads.get(enrollmentId);
      if (!payload) continue;
      this.events.emit(ENROLLMENT_COMPLETED_EVENT, payload);
    }
    if (missed.length > 0) {
      this.logger.warn(
        `Повторяем выпуск документов: центр ${tenantId}, зачислений ${missed.length}`
      );
    }
    return missed.length;
  }
}
