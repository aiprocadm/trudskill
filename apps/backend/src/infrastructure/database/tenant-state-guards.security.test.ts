import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Сторож программы 272+292: обе линии обороны записи состояния арендатора на месте.
 *
 * Почему сторож нужен. Состояние центра хранится СНИМКОМ, и сохранение переписывает
 * коллекцию целиком. Порядок «прочитать → изменить → записать» сериализован замком
 * арендатора, но замок держит очередь в ПАМЯТИ ПРОЦЕССА — второй экземпляр за прокси не
 * защищён им никак. Обе проверки, снятые «за ненадобностью», вернут ровно тот дефект,
 * ради которого их и завели: чужие изменения затираются целиком и молча, а регулируемая
 * нумерация теряет последнюю линию обороны от дубля номера.
 *
 * Сторож читает БОЕВОЙ код, а не повторяет его: проверяется, что запись снимка сверяет
 * версию, а запись документов заявляет номера.
 */

const backendRoot = process.cwd().endsWith(join('apps', 'backend'))
  ? process.cwd()
  : join(process.cwd(), 'apps', 'backend');

const read = (relative: string): string => readFileSync(join(backendRoot, relative), 'utf8');

const MVP_BACKEND = 'src/modules/mvp/infrastructure/postgres-mvp-persistence.backend.ts';
const DOCUMENTS_BACKEND =
  'src/modules/documents/infrastructure/postgres-documents-persistence.backend.ts';

describe('запись состояния арендатора защищена (журнал 272/292)', () => {
  it('оба снимка сверяют версию перед записью', () => {
    for (const file of [MVP_BACKEND, DOCUMENTS_BACKEND]) {
      expect(
        read(file),
        `${file} обязан сверять версию снимка: без этого запись второго экземпляра ` +
          'затрёт чужие изменения молча'
      ).toContain('bumpTenantStateVersion(');
    }
  });

  it('оба снимка запоминают версию НА ЧТЕНИИ — иначе сверять нечего', () => {
    for (const file of [MVP_BACKEND, DOCUMENTS_BACKEND]) {
      const source = read(file);
      expect(source, `${file} обязан читать версию при загрузке`).toContain(
        'readTenantStateVersion('
      );
      expect(source, `${file} обязан класть прочитанную версию на состояние`).toContain(
        'state.stateVersionAtLoad ='
      );
    }
  });

  it('запись документов заявляет номера — последняя линия обороны от дубля', () => {
    expect(
      read(DOCUMENTS_BACKEND),
      'без заявки уникальность номера снова держится только на проверке в памяти'
    ).toContain('claimIssuedNumbers(');
  });

  it('условие сверки версии не ослаблено до «всегда проходит»', () => {
    const guard = read('src/infrastructure/database/tenant-state-version.ts');
    // Ноль изменённых строк = нас опередили. Если перестать на это смотреть, проверка
    // превратится в дорогой способ ничего не проверять.
    expect(guard).toContain('result.rowCount === 0');
    expect(guard).toContain('TenantStateConflictError');
  });

  it('заявка на номер сверяет ВЛАДЕЛЬЦА, а не только наличие строки', () => {
    const claims = read('src/modules/documents/infrastructure/issued-number-claims.ts');
    // `on conflict do nothing` сам по себе дубль не ловит: он молча пропускает чужую
    // заявку. Ловит именно сверка владельца.
    expect(claims).toContain('owner !== claim.id');
    expect(claims).toContain('DuplicateDocumentNumberError');
  });
});
