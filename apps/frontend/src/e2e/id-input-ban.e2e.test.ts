import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Поля «вставьте идентификатор» (правило продукта: ни одного сырого ID как значения).
 *
 * За срезы 5–9 Фазы 4 такое поле находилось на КАЖДОМ разобранном экране: `entity_id` при
 * выпуске документа, «ID курса» при создании теста, `course_id` / `group_id` / `client_id`
 * в аналитике и отчётах. Администратор учебного центра идентификаторов не знает — их
 * приходилось подсматривать в адресной строке другого экрана.
 *
 * Сторож не запрещает такие поля задним числом: он фиксирует ОЧЕРЕДЬ известных мест
 * с указанием волны и падает, если появится НОВОЕ. Тот же приём, что у сторожа единых
 * состояний: список — это очередь, а не разрешение.
 */

const ROOTS = ['src/features', 'app'];
const ID_PLACEHOLDER = /placeholder=["'][^"']*(?:\bID\b|\bid\b|_id|UUID)[^"']*["']/;

/** Известные места на момент среза 9. Строка = файл + волна, в которую он попадает. */
const KNOWN: Record<string, string> = {
  'app/audit/page.tsx': 'волна 4: журнал действий — поиск по идентификатору записи и запроса',
  'src/features/gov-export/gov-export-screen.tsx':
    'волна 3: выгрузка в реестры — отбор по группе и заказчику',
  'app/materials/page.tsx': 'волна 3: материалы — отбор по модулю',
  'src/features/close-group/screens.tsx':
    'волна 1 (закрытие группы вызывается из карточки, форма осталась прежней): группа, шаблоны, список сдавших',
  'src/features/groups/group-details-screen.tsx':
    'волна 1: добавление слушателя в группу по идентификатору',
  'src/features/payments/screens.tsx': 'волна 4: оплаты — плательщик и группа'
};

const collect = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collect(full, acc);
      continue;
    }
    if (full.endsWith('.tsx') && !full.includes('.test.')) acc.push(full);
  }
  return acc;
};

describe('поля «вставьте идентификатор» (очередь редизайна)', () => {
  const offenders = ROOTS.flatMap((root) => collect(root))
    .filter((file) => ID_PLACEHOLDER.test(readFileSync(file, 'utf8')))
    .map((file) => file.replace(/\\/g, '/'))
    .sort();

  it('новых мест, где просят вставить идентификатор, не появилось', () => {
    const unexpected = offenders.filter((file) => !(file in KNOWN));
    expect(
      unexpected,
      'экраны просят у человека идентификатор — заменить выбором по названию'
    ).toEqual([]);
  });

  it('очередь не содержит уже исправленных мест — иначе список врёт', () => {
    const fixed = Object.keys(KNOWN).filter((file) => !offenders.includes(file));
    expect(fixed, 'место исправлено — уберите его из списка сторожа').toEqual([]);
  });

  it('у каждого места в очереди указана волна', () => {
    const withoutWave = Object.entries(KNOWN)
      .filter(([, note]) => !note.includes('волна'))
      .map(([file]) => file);
    expect(withoutWave).toEqual([]);
  });
});
