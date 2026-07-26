import { describe, expect, it } from 'vitest';

import { buildDocx, p, readDocumentXml, splitRunsP } from './docx-fixture.js';
import { TemplateRenderError, extractPlaceholders, renderDocx } from './docx-render.js';

describe('renderDocx (ФТ-A1.2/A2)', () => {
  it('substitutes flat dotted keys — the exact dictionary shape of pillar-a-variables', () => {
    const template = buildDocx(
      p('Удостоверение выдано: {learner.full_name}') + p('Программа: {program.title}')
    );
    const out = renderDocx(template, {
      'learner.full_name': 'Иванов Иван Иванович',
      'program.title': 'Охрана труда'
    });
    const xml = readDocumentXml(out);
    expect(xml).toContain('Удостоверение выдано: Иванов Иван Иванович');
    expect(xml).toContain('Программа: Охрана труда');
    expect(xml).not.toContain('{learner.full_name}');
  });

  it('substitutes a tag that Word split across several runs', () => {
    const template = buildDocx(splitRunsP('Номер: {docu', 'ment.nu', 'mber}'));
    const out = renderDocx(template, { 'document.number': '26-ОТ-0001' });
    expect(readDocumentXml(out)).toContain('26-ОТ-0001');
  });

  it('renders a loop over group learners — N rows for the protocol table', () => {
    const template = buildDocx(
      p('{#group_learners}') + p('{row_no}. {full_name} — {snils}') + p('{/group_learners}')
    );
    const out = renderDocx(template, {
      group_learners: [
        { row_no: 1, full_name: 'Иванов И. И.', snils: '112-233-445 95' },
        { row_no: 2, full_name: 'Петров П. П.', snils: '116-973-385 89' },
        { row_no: 3, full_name: 'Сидорова А. А.', snils: 'altogether' }
      ]
    });
    const xml = readDocumentXml(out);
    expect(xml).toContain('1. Иванов И. И. — 112-233-445 95');
    expect(xml).toContain('2. Петров П. П. — 116-973-385 89');
    expect(xml).toContain('3. Сидорова А. А.');
  });

  it('renders conditional sections: truthy shows, falsy hides, inverted works', () => {
    const template = buildDocx(
      p('{#with_distinction}С отличием{/with_distinction}') +
        p('{^with_distinction}Обычный документ{/with_distinction}')
    );
    const withFlag = readDocumentXml(renderDocx(template, { with_distinction: true }));
    expect(withFlag).toContain('С отличием');
    expect(withFlag).not.toContain('Обычный документ');
    const withoutFlag = readDocumentXml(renderDocx(template, { with_distinction: false }));
    expect(withoutFlag).toContain('Обычный документ');
    expect(withoutFlag).not.toContain('С отличием');
  });

  it('unknown tags render as an empty string (nullGetter), not as "undefined"', () => {
    const template = buildDocx(p('До: [{unknown.tag}] после'));
    const xml = readDocumentXml(renderDocx(template, {}));
    expect(xml).toContain('До: [] после');
    expect(xml).not.toContain('undefined');
  });

  it('is byte-deterministic: same template + same data → identical file (ФТ-A1.4)', async () => {
    const template = buildDocx(p('{learner.full_name}'));
    const data = { 'learner.full_name': 'Иванов' };
    const first = renderDocx(template, data);
    await new Promise((resolve) => setTimeout(resolve, 1100)); // пересечь границу секунды zip-таймстемпов
    const second = renderDocx(template, data);
    expect(first.equals(second)).toBe(true);
  });

  it('throws TemplateRenderError with readable problems on an unclosed loop', () => {
    const template = buildDocx(p('{#group_learners}') + p('{full_name}'));
    try {
      renderDocx(template, { group_learners: [] });
      expect.unreachable('expected TemplateRenderError');
    } catch (error) {
      expect(error).toBeInstanceOf(TemplateRenderError);
      const problems = (error as TemplateRenderError).problems;
      expect(problems.length).toBeGreaterThan(0);
      expect(problems.join(' ')).toMatch(/group_learners|unclosed|unopened/i);
    }
  });

  it('throws TemplateRenderError on a broken (non-zip) template buffer', () => {
    expect(() => renderDocx(Buffer.from('not a docx at all'), {})).toThrow(TemplateRenderError);
  });
});

describe('extractPlaceholders (ФТ-A3.2)', () => {
  it('lists tags in order, counts loop/condition openers once, skips closers', () => {
    const template = buildDocx(
      p('{tenant.name}') +
        p('{#group_learners}') +
        p('{full_name} {snils}') +
        p('{/group_learners}') +
        p('{^with_distinction}нет отличия{/with_distinction}') +
        p('и снова {tenant.name}')
    );
    expect(extractPlaceholders(template)).toEqual([
      'tenant.name',
      'group_learners',
      'full_name',
      'snils',
      'with_distinction'
    ]);
  });

  it('finds a tag split across runs', () => {
    const template = buildDocx(splitRunsP('{docu', 'ment.number}'));
    expect(extractPlaceholders(template)).toEqual(['document.number']);
  });
});
