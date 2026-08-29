import { Injectable } from '@nestjs/common';

import type {
  DocumentGenerationTaskEntity,
  GeneratedDocumentEntity,
  NumberReservationEntity,
  NumberingRuleEntity,
  TemplateBindingEntity,
  TemplateEntity,
  TemplateVariableEntity,
  TemplateVersionEntity
} from './documents.types.js';

@Injectable()
export class InMemoryDocumentsState {
  templates: TemplateEntity[] = [];
  versions: TemplateVersionEntity[] = [];
  variables: TemplateVariableEntity[] = [];
  bindings: TemplateBindingEntity[] = [];
  tasks: DocumentGenerationTaskEntity[] = [];
  generatedDocuments: GeneratedDocumentEntity[] = [];
  numberingRules: NumberingRuleEntity[] = [];
  reservations: NumberReservationEntity[] = [];
  idem = new Map<string, { taskId: string; expiresAt: number }>();

  /**
   * Версия снимка на момент чтения (журнал 272/292). Запись сверяет её и увеличивает:
   * если версия ушла вперёд, значит снимок поменял кто-то ещё — писать поверх нельзя.
   * `undefined` — состояние собрано в памяти и из базы не читалось (тесты, memory-драйвер).
   */
  stateVersionAtLoad: number | undefined = undefined;

  /**
   * Отпечаток состояния сразу после чтения (журнал 299).
   *
   * Правило «чтение не должно ничего писать» применили к состоянию mvp ещё в Фазе 6, но к
   * документам — нет: снимок переписывался на КАЖДЫЙ запрос, включая обычный показ списка
   * («удалить всё и вставить заново»). Отпечаток отвечает на вопрос «есть ли что писать».
   */
  private fingerprintAtLoad: string | undefined = undefined;

  /** Снять отпечаток. Зовётся загрузкой сразу после раскладки снимка. */
  captureLoadFingerprint(): void {
    this.fingerprintAtLoad = this.fingerprint();
  }

  /**
   * Менялось ли состояние с момента чтения. Отпечатка нет — значит из базы не читали
   * (память, тесты): тогда пишем, как раньше, ничего не додумывая.
   */
  hasChangedSinceLoad(): boolean {
    if (this.fingerprintAtLoad === undefined) return true;
    return this.fingerprint() !== this.fingerprintAtLoad;
  }

  private fingerprint(): string {
    return JSON.stringify([
      this.templates,
      this.versions,
      this.variables,
      this.bindings,
      this.tasks,
      this.generatedDocuments,
      this.numberingRules,
      this.reservations,
      [...this.idem.entries()]
    ]);
  }
}
