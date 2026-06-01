import { describe, expect, it } from 'vitest';

import { OtRegistryXmlWriter } from './ot-registry-xml.writer.js';

import type { OtRegistryRow } from '../mvp.types.js';

const row: OtRegistryRow = {
  enrollmentId: 'e1',
  learnerId: 'l1',
  fullName: 'Иванов Иван Иванович',
  snils: '112-233-445 95',
  position: 'Слесарь',
  employerInn: '7707083893',
  programCode: 'OT_A',
  programRegistryId: 1,
  programName: 'Программа А',
  protocolNumber: 'ПР-12/2026',
  knowledgeCheckDate: '10.03.2026',
  result: 'удовлетворительно'
};

describe('OtRegistryXmlWriter', () => {
  it('serializes a row to provisional XSD-1.0.3 XML, with org attrs when provided', () => {
    const xml = new OtRegistryXmlWriter()
      .build([row], { inn: '7707083893', registrationNumber: 'РН-1' })
      .toString('utf-8');
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('ВерсияФормата="1.0.3"');
    expect(xml).toContain('ИННОрганизации="7707083893"');
    expect(xml).toContain('РегНомерОрганизации="РН-1"');
    expect(xml).toContain('<СНИЛС>112-233-445 95</СНИЛС>');
    expect(xml).toContain('<ФИО>Иванов Иван Иванович</ФИО>');
    expect(xml).toContain('<ПрограммаОбучения Код="1">Программа А</ПрограммаОбучения>');
    expect(xml).toContain('<РезультатПроверкиЗнаний>удовлетворительно</РезультатПроверкиЗнаний>');
  });

  it('escapes XML-special chars and omits org attrs when org not provided', () => {
    const xml = new OtRegistryXmlWriter()
      .build([{ ...row, position: 'Мастер & K<>"' }])
      .toString('utf-8');
    expect(xml).toContain('<Должность>Мастер &amp; K&lt;&gt;&quot;</Должность>');
    expect(xml).not.toContain('ИННОрганизации=');
  });
});
