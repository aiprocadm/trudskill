import { Inject, Injectable } from '@nestjs/common';

import { LOOKUP_REPOSITORY } from './lookup.repository.js';
import { AuditService } from '../audit/audit.service.js';

import type { CodeNameRow, LookupRepository, PositionRow } from './lookup.repository.js';

const POSITIONS_LIMIT = 50;
const POSITION_MAX_LENGTH = 200;

/**
 * Нормализация должности (РМ80): обрезать и схлопнуть пробелы; запись целиком ЗАГЛАВНЫМИ
 * (так приходят выгрузки CDOPROF) → первая буква заглавная, остальные строчные; иначе —
 * как ввели. Дубли без учёта регистра снимает индекс уникальности.
 */
export const normalizePositionName = (raw: string): string => {
  const collapsed = raw.replace(/\s+/g, ' ').trim();
  if (!collapsed) return '';
  const letters = collapsed.replace(/[^\p{L}]/gu, '');
  const allCaps = letters.length > 1 && letters === letters.toUpperCase();
  const normalized = allCaps
    ? collapsed.charAt(0).toUpperCase() + collapsed.slice(1).toLowerCase()
    : collapsed;
  return normalized.slice(0, POSITION_MAX_LENGTH);
};

/** Уникальные нормализованные имена пачки — без пустых и без повторов (без учёта регистра). */
export const uniquePositionNames = (raw: ReadonlyArray<string | undefined | null>): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of raw) {
    const name = normalizePositionName(value ?? '');
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
};

@Injectable()
export class LookupService {
  constructor(
    @Inject(LOOKUP_REPOSITORY) private readonly repo: LookupRepository,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  listPositions(tenantId: string, q = ''): Promise<PositionRow[]> {
    return this.repo.listPositions(tenantId, q, POSITIONS_LIMIT);
  }

  /**
   * Автопополнение (МГ-C1.2): вызывается после импорта, мастера группы и правки карточки.
   * Ничего не ломает: отказ справочника не должен уронить операцию, ради которой он звался, —
   * поэтому вызывающая сторона оборачивает вызов в `rememberPositionsSafely`.
   */
  async rememberPositions(
    tenantId: string,
    raw: ReadonlyArray<string | undefined | null>,
    actorId?: string
  ): Promise<{ added: number; names: string[] }> {
    const names = uniquePositionNames(raw);
    if (names.length === 0) return { added: 0, names: [] };
    const added = await this.repo.rememberPositions(tenantId, names);
    if (added > 0) {
      this.audit.write({
        tenantId,
        actorId,
        action: 'lookup.positions_added',
        entityType: 'lookup.position',
        entityId: tenantId,
        newValues: { added, names }
      });
    }
    return { added, names };
  }

  /** Тот же вызов, но отказ справочника — в журнал, а не наружу: пополнение вторично. */
  async rememberPositionsSafely(
    tenantId: string,
    raw: ReadonlyArray<string | undefined | null>,
    actorId?: string
  ): Promise<void> {
    try {
      await this.rememberPositions(tenantId, raw, actorId);
    } catch {
      // Справочник должностей — подсказки; сорвавшееся пополнение не отменяет импорт или правку.
    }
  }

  listEducationLevels(): Promise<CodeNameRow[]> {
    return this.repo.listEducationLevels();
  }

  listCountries(): Promise<CodeNameRow[]> {
    return this.repo.listCountries();
  }
}
