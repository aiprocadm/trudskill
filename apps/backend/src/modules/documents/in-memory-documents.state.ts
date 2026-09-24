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
   * Часовой пояс центра (журнал 300). По нему считаются КАЛЕНДАРНЫЕ даты: дата документа и
   * период его номера. `undefined` — пояс не спрашивали (тесты, память): берётся значение
   * по умолчанию, то же, что подставляют настройки центра.
   */
  tenantTimezone: string | undefined = undefined;

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

  /**
   * Отпечатки документов поимённо (Фаза 1, срез 5a): проекция в `documents.generated_documents`
   * пишет только изменённые документы, а не все документы центра на каждое сохранение.
   * Остальные коллекции домена в таблицы не проецируются, им хватает общего отпечатка.
   */
  private documentFingerprintAtLoad: Map<string, string> | undefined = undefined;

  /** Снять отпечаток. Зовётся загрузкой сразу после раскладки снимка. */
  captureLoadFingerprint(): void {
    this.fingerprintAtLoad = this.fingerprint();
    this.documentFingerprintAtLoad = new Map(
      this.generatedDocuments.map((document) => [document.id, JSON.stringify(document)])
    );
  }

  /**
   * Какие документы менялись с чтения: новые и изменённые — целиком, удалённые — по id.
   * Отпечатка нет (память, тесты) — `'all'`: проецировать всё и убрать из таблицы лишнее.
   */
  changedGeneratedDocuments():
    | { upserted: GeneratedDocumentEntity[]; deletedIds: string[] }
    | 'all' {
    if (this.documentFingerprintAtLoad === undefined) return 'all';
    const seen = new Set<string>();
    const upserted: GeneratedDocumentEntity[] = [];
    for (const document of this.generatedDocuments) {
      seen.add(document.id);
      if (this.documentFingerprintAtLoad.get(document.id) !== JSON.stringify(document)) {
        upserted.push(document);
      }
    }
    const deletedIds = [...this.documentFingerprintAtLoad.keys()].filter((id) => !seen.has(id));
    return { upserted, deletedIds };
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
