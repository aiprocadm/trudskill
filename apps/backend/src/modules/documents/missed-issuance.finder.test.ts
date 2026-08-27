import { describe, expect, it } from 'vitest';

import { findMissedIssuance } from './missed-issuance.finder.js';

const HOUR = 60 * 60 * 1000;
const NOW = Date.parse('2026-08-27T12:00:00.000Z');
const GRACE = 30 * 60 * 1000;

const completed = (
  over: Partial<Parameters<typeof findMissedIssuance>[0]['completed'][0]> = {}
) => ({
  enrollmentId: 'enr_1',
  autoIssueTemplateIds: ['tpl_cert'],
  completedAt: new Date(NOW - 2 * HOUR).toISOString(),
  ...over
});

/*
 * Ревизия 2026-08-27 (порция 37, журнал 273): выпуск документов держится на событии
 * ВНУТРИ процесса. Перезапуск в этот момент теряет его без следа и без повтора —
 * слушатель ждёт удостоверение, администратор уверен, что оно выдано, а узнают об этом
 * на проверке. Механизм надёжной доставки в проекте построен и пуст, поэтому здесь —
 * страховка добором: находим завершённые зачисления без обязательного документа.
 */
describe('поиск невыпущенных документов (порция 37)', () => {
  it('документ не выпущен и время вышло — зачисление в доборе', () => {
    expect(
      findMissedIssuance({ completed: [completed()], issued: [], nowMs: NOW, graceMs: GRACE })
    ).toEqual(['enr_1']);
  });

  it('документ выпущен — добирать нечего', () => {
    expect(
      findMissedIssuance({
        completed: [completed()],
        issued: [
          { sourceEntityType: 'enrollment', sourceEntityId: 'enr_1', templateId: 'tpl_cert' }
        ],
        nowMs: NOW,
        graceMs: GRACE
      })
    ).toEqual([]);
  });

  it('выпущена часть набора — зачисление всё равно в доборе', () => {
    expect(
      findMissedIssuance({
        completed: [completed({ autoIssueTemplateIds: ['tpl_cert', 'tpl_proto'] })],
        issued: [
          { sourceEntityType: 'enrollment', sourceEntityId: 'enr_1', templateId: 'tpl_cert' }
        ],
        nowMs: NOW,
        graceMs: GRACE
      })
    ).toEqual(['enr_1']);
  });

  it('свежее завершение не трогаем: выпуск может идти прямо сейчас', () => {
    expect(
      findMissedIssuance({
        completed: [completed({ completedAt: new Date(NOW - 60_000).toISOString() })],
        issued: [],
        nowMs: NOW,
        graceMs: GRACE
      })
    ).toEqual([]);
  });

  it('без автовыпуска в наборе добирать нечего', () => {
    expect(
      findMissedIssuance({
        completed: [completed({ autoIssueTemplateIds: [] })],
        issued: [],
        nowMs: NOW,
        graceMs: GRACE
      })
    ).toEqual([]);
  });

  it('без даты завершения не гадаем', () => {
    const noDate = { enrollmentId: 'enr_2', autoIssueTemplateIds: ['tpl_cert'] };
    expect(
      findMissedIssuance({ completed: [noDate], issued: [], nowMs: NOW, graceMs: GRACE })
    ).toEqual([]);
  });

  it('документ по ДРУГОМУ зачислению не засчитывается', () => {
    expect(
      findMissedIssuance({
        completed: [completed()],
        issued: [
          { sourceEntityType: 'enrollment', sourceEntityId: 'enr_other', templateId: 'tpl_cert' }
        ],
        nowMs: NOW,
        graceMs: GRACE
      })
    ).toEqual(['enr_1']);
  });

  it('документ, выпущенный не по зачислению, в расчёт не идёт', () => {
    expect(
      findMissedIssuance({
        completed: [completed()],
        issued: [{ sourceEntityType: 'group', sourceEntityId: 'enr_1', templateId: 'tpl_cert' }],
        nowMs: NOW,
        graceMs: GRACE
      })
    ).toEqual(['enr_1']);
  });
});
