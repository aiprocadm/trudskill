import { Injectable } from '@nestjs/common';

import type { OtRegistryRow } from '../mvp.types.js';

/**
 * PROVISIONAL — сверить имена элементов/атрибутов и пространство имён с офиц. XSD-схемой
 * ЛКОТ версии 1.0.3 перед боевой отправкой (spec §13/§16). Канонический формат импорта
 * реестра — XML по XSD 1.0.3; .xlsx — человеко-читаемый шаблон. Все имена ниже — best-effort.
 * Единственное место маппинга поле→XML-элемент (single swap point).
 */
const ELEMENTS = {
  record: 'Запись',
  snils: 'СНИЛС',
  fullName: 'ФИО',
  position: 'Должность',
  program: 'ПрограммаОбучения',
  programCodeAttr: 'Код',
  knowledgeCheckDate: 'ДатаПроверкиЗнаний',
  result: 'РезультатПроверкиЗнаний',
  protocolNumber: 'НомерПротокола',
  employerInn: 'ИННРаботодателя'
} as const;

const FORMAT_VERSION = '1.0.3';
const ROOT = 'РеестрОбученныхОТ';

export interface OtRegistryOrg {
  inn?: string;
  registrationNumber?: string;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

@Injectable()
export class OtRegistryXmlWriter {
  readonly contentType = 'application/xml';

  build(rows: OtRegistryRow[], org: OtRegistryOrg = {}): Buffer {
    const e = ELEMENTS;
    const attrs = [
      `ВерсияФормата="${FORMAT_VERSION}"`,
      org.inn ? `ИННОрганизации="${escapeXml(org.inn)}"` : '',
      org.registrationNumber ? `РегНомерОрганизации="${escapeXml(org.registrationNumber)}"` : ''
    ]
      .filter(Boolean)
      .join(' ');

    const tag = (name: string, val: string): string => `    <${name}>${escapeXml(val)}</${name}>`;

    const body = rows
      .map((r) =>
        [
          `  <${e.record}>`,
          tag(e.snils, r.snils),
          tag(e.fullName, r.fullName),
          tag(e.position, r.position),
          `    <${e.program} ${e.programCodeAttr}="${escapeXml(String(r.programRegistryId))}">${escapeXml(r.programName)}</${e.program}>`,
          tag(e.knowledgeCheckDate, r.knowledgeCheckDate),
          tag(e.result, r.result),
          tag(e.protocolNumber, r.protocolNumber),
          tag(e.employerInn, r.employerInn),
          `  </${e.record}>`
        ].join('\n')
      )
      .join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<${ROOT} ${attrs}>\n${body}\n</${ROOT}>\n`;
    return Buffer.from(xml, 'utf-8');
  }
}
