import { SetMetadata } from '@nestjs/common';

import type { NormalizableCollection } from './normalized-collections.js';

/**
 * Пометка GET-ручки: «данные этой коллекции читаются из нормализованной таблицы» (Фаза 1, срез 1b).
 *
 * Когда коллекция включена флагом `LMS_NORMALIZED_COLLECTIONS`, `MvpRequestPersistenceInterceptor`
 * для такой ручки НЕ берёт замок арендатора и НЕ грузит JSON-снимок — именно это и даёт выигрыш
 * (снимок центра на объёме CDOPROF читается 0,37 с). Вешать только на ручки, которые ничего не
 * пишут в состояние: без загрузки снимка сохранять будет нечего, и мутация потерялась бы молча.
 * При выключенном флаге пометка ничего не меняет.
 */
export const READS_NORMALIZED = 'reads_normalized_collection';

export const ReadsNormalized = (collection: NormalizableCollection) =>
  SetMetadata(READS_NORMALIZED, collection);
