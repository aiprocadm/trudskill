import type { ConsentKind } from './consent.js';

export const CONSENT_TEXT_REPOSITORY = Symbol('CONSENT_TEXT_REPOSITORY');

export interface ConsentTextRow {
  tenantId: string;
  kind: ConsentKind;
  version: number;
  body: string;
  bodyHash: string;
  createdAt: string;
}

export interface ConsentTextRepository {
  /** Действующая (последняя) версия текста данного вида. */
  findCurrent(tenantId: string, kind: ConsentKind): Promise<ConsentTextRow | null>;
  /** Новая версия; старые не переписываются — по ним уже дали согласие. */
  insert(
    tenantId: string,
    kind: ConsentKind,
    body: string,
    bodyHash: string
  ): Promise<ConsentTextRow>;
}
