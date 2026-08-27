import { AsyncLocalStorage } from 'node:async_hooks';

import { Injectable } from '@nestjs/common';

/** Критическая секция арендатора, которую держит текущая цепочка выполнения. */
interface HeldSection {
  tenantId: string;
  /** Пока `true` — секция ещё идёт. Ветка, пережившая её, замок не наследует. */
  active: boolean;
}

/**
 * Serializes async work per tenant (MVP/documents request persistence, reminder scans, etc.).
 * REENTRANT per tenant: if the current async execution already holds tenant T's critical section,
 * a nested runExclusive(T) runs inline instead of deadlocking on the chain it is already inside.
 * (Without this, a documents-runner call nested inside an MVP-runner/interceptor section for the
 * same tenant would await the very promise it is part of — a circular wait.)
 *
 * ⚠️ Ревизия 2026-08-27 (порция 26, журнал 271). Реентрантность опознаётся по
 * AsyncLocalStorage, а его контекст наследуют не только вложенные вызовы, но и
 * ОТСОЕДИНЁННЫЕ ветки: `setImmediate`, обработчики событий, любые фоновые продолжения.
 * Такая ветка считала замок «уже своим» и работала ПАРАЛЛЕЛЬНО с чужой секцией того же
 * арендатора, а сохранение переписывает снимок домена целиком — победитель затирал
 * свежевыпущенные удостоверения. Две меры:
 *
 *  - `runDetached` — явное «эта работа не часть моей секции» для точки, где ветка
 *    отпочковывается (см. слушатель выдачи документов);
 *  - секция помечается завершённой, поэтому ветка, ПЕРЕЖИВШАЯ её, реентрантной уже
 *    не считается, даже если про `runDetached` забыли.
 */
@Injectable()
export class TenantSerialGateway {
  private readonly chains = new Map<string, Promise<unknown>>();
  /** Секции, которые держит текущая цепочка выполнения. */
  private readonly heldSections = new AsyncLocalStorage<HeldSection[]>();

  async runExclusive<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
    const held = this.heldSections.getStore();
    if (held?.some((section) => section.tenantId === tenantId && section.active)) {
      // Reentrant: this async execution already owns tenantId's lock — run inline.
      return fn();
    }

    const section: HeldSection = { tenantId, active: true };
    const nextHeld = [...(held ?? []), section];

    const prev = this.chains.get(tenantId) ?? Promise.resolve();
    const current = prev.then(async () => {
      try {
        return await this.heldSections.run(nextHeld, fn);
      } finally {
        section.active = false;
      }
    });
    this.chains.set(
      tenantId,
      current.then(
        () => undefined,
        () => undefined
      )
    );
    await prev;
    return current;
  }

  /**
   * Выполнить работу ВНЕ удерживаемых сейчас секций.
   *
   * Нужно в точке, где отпочковывается фоновая ветка (слушатель события, `setImmediate`):
   * без этого она унаследует замки породившего запроса и пойдёт мимо очереди.
   */
  runDetached<T>(fn: () => T): T {
    return this.heldSections.exit(fn);
  }
}
