import { readFileSync, readdirSync, statSync } from 'node:fs';
import { relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { APP_ROOT, fromApp } from './app-root';
import { stripComments } from './backend-source';
import { closeGroupRequest } from '../features/close-group/confirm';
import { statusChangeRequest } from '../features/platform-tenants/status-confirm';
import { finishTestRequest } from '../features/test-player/finish-confirm';

/**
 * Подтверждение необратимых действий (ТЗ «Стабилизация, UX и развитие», 5.3 / Э3).
 *
 * **Как было.** Из шести действий ТЗ три срабатывали с одного нажатия — без диалога вовсе:
 * «Приостановить центр» и «Перевести в архив» (меню строки арендаторов), «Закрыть группу» (и
 * одиночное, и цепочка), «Завершить тест». У «Отозвать лицензию» подтверждение с вводом номера
 * уже было — эталон вместе с «Обезличиванием»; у «Архивировать слушателя» — диалог с числом и
 * последствием.
 *
 * **Правило.** Диалог называет объект («Закрыть группу «Группа 360px»?»), называет последствие
 * («состав группы изменить будет нельзя») и требует осознанного клика. Для самого тяжёлого —
 * ввод названия: закрытие группы (название), архив центра (код), отзыв лицензии (номер).
 *
 * Здесь два слоя: чистые функции запросов проверяются по значениям, экраны — по тому, что они
 * ЭТИ функции и зовут (иначе диалог живёт в тесте, а не на экране).
 */

const TENANTS = fromApp('src', 'features', 'platform-tenants', 'screens.tsx');
const CLOSE_GROUP = fromApp('src', 'features', 'close-group', 'screens.tsx');
const GROUPS_LIST = fromApp('src', 'features', 'groups', 'groups-list-screen.tsx');
const ATTEMPT = fromApp('src', 'features', 'test-player', 'test-attempt-screen.tsx');
const LICENSES = fromApp('src', 'features', 'licenses', 'licenses-list.tsx');
const LEARNERS = fromApp('src', 'features', 'learners', 'learners-list-screen.tsx');
const PATTERNS = fromApp('..', '..', 'docs', 'ui', 'patterns.md');
const ROOTS = [fromApp('src', 'features'), fromApp('app')];

const read = (file: string): string => stripComments(readFileSync(file, 'utf8'));
const rel = (file: string): string => relative(APP_ROOT, file).replace(/\\/g, '/');

const collect = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = `${dir}/${entry}`;
    if (statSync(full).isDirectory()) {
      collect(full, acc);
      continue;
    }
    if (entry.endsWith('.tsx') && !entry.includes('.test.')) acc.push(full);
  }
  return acc;
};

/** Тело каждого вызова `ask(` — до закрывающей скобки вызова. */
const askBlocks = (source: string): string[] => {
  const blocks: string[] = [];
  const re = /\bask(?:Finish)?\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    let depth = 0;
    let i = m.index + m[0].length - 1;
    for (; i < source.length; i += 1) {
      if (source[i] === '(') depth += 1;
      if (source[i] === ')') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    blocks.push(source.slice(m.index, i + 1));
  }
  return blocks;
};

describe('необратимое действие подтверждается с объектом и последствием (ТЗ 5.3)', () => {
  it('центр: приостановка и архив — через диалог; архив требует ввести код центра', () => {
    const tenant = { name: 'Ромб', code: 'romb' };
    expect(statusChangeRequest(tenant, 'suspended').message).toContain('«Ромб»');
    expect(statusChangeRequest(tenant, 'archived').requireTyping?.word).toBe('romb');
    const source = read(TENANTS);
    expect(
      /ask\(\s*statusChangeRequest\(tenant, status\)/.test(source),
      'смена статуса обязана идти через диалог, а не с одного нажатия в меню строки'
    ).toBe(true);
    expect(/archived: 'Перевести центр в архив'/.test(source), 'у архива своё имя').toBe(true);
  });

  it('группа: закрытие и цепочка — через диалог с вводом названия группы', () => {
    const request = closeGroupRequest({ groupName: 'ОТ-14', learnersCount: 3, mode: 'close' });
    expect(request.title).toContain('«ОТ-14»');
    expect(request.message).toMatch(/изменить будет нельзя/);
    expect(request.requireTyping?.word).toBe('ОТ-14');
    const source = read(CLOSE_GROUP);
    expect(/onClick=\{\(\) => confirmClose\(\)\}/.test(source)).toBe(true);
    expect(/onClick=\{\(\) => confirmChain\(\)\}/.test(source)).toBe(true);
    expect(
      /onClick=\{\(\) => void (closeGroup|runChain)\(\)\}/.test(source),
      'закрытие с одного нажатия'
    ).toBe(false);
    const list = read(GROUPS_LIST);
    expect(/confirmBulkClose\(\)/.test(list) && /изменить будет нельзя/.test(list)).toBe(true);
  });

  it('тест: «Завершить тест» по кнопке — с диалогом о неотвеченных; автосдача — без', () => {
    expect(finishTestRequest({ unanswered: 2, total: 5 }).message).toMatch(/Без ответа: 2 из 5/);
    const source = read(ATTEMPT);
    expect(/askFinish\(\s*finishTestRequest\(/.test(source)).toBe(true);
    expect(
      /handleSubmit(?:Ref\.current)?\(\{\s*auto:\s*true\s*\}\)/.test(source),
      'автосдача по таймеру остаётся без диалога — выбора там уже нет'
    ).toBe(true);
  });

  it('лицензия и слушатели: эталоны на месте', () => {
    const licenses = read(LICENSES);
    expect(/requireTyping:\s*\{\s*word:\s*license\.licenseNumber/.test(licenses)).toBe(true);
    const learners = read(LEARNERS);
    expect(/Выбрано: \$\{selected\.length\}/.test(learners), 'диалог называет объём').toBe(true);
    expect(/не участвуют в новых зачислениях/.test(learners), 'диалог называет последствие').toBe(
      true
    );
  });

  it('каждый опасный диалог на экранах называет объект и последствие', () => {
    const offenders: string[] = [];
    for (const file of ROOTS.flatMap((root) => collect(root))) {
      const source = read(file);
      for (const block of askBlocks(source)) {
        if (!/tone:\s*'danger'/.test(block)) continue;
        /* Запрос собран функцией — объект и последствие проверены на её значениях выше. */
        if (/^ask(?:Finish)?\(\s*[a-zA-Z]+Request\(/.test(block)) continue;
        if (!/message:\s*`[^`]*\$\{/.test(block)) offenders.push(`${rel(file)}: без объекта`);
        else if (
          !/(нельзя|перестан|закро|потеря|удал|исчезн|не попад|не сможет|не смогут|уйд|останов)/.test(
            block
          )
        )
          offenders.push(`${rel(file)}: без последствия`);
      }
    }
    expect(
      offenders,
      'опасный диалог обязан назвать объект (подстановка в message) и последствие'
    ).toEqual([]);
  });

  it('правило записано в docs/ui/patterns.md', () => {
    const doc = readFileSync(PATTERNS, 'utf8');
    expect(doc).toContain('## Э3');
    expect(doc).toContain('requireTyping');
  });
});
