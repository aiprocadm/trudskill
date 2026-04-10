import { Injectable } from '@nestjs/common';

import { InMemoryDocumentsState } from './in-memory-documents.state.js';

/**
 * Заглушка под персистентное хранилище документов.
 * Сейчас наследует in-memory; замените реализацией с DatabaseService, сохранив контракт полей для DocumentsService.
 */
@Injectable()
export class PostgresDocumentsPersistenceStub extends InMemoryDocumentsState {}
