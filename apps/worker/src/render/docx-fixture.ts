import PizZip from 'pizzip';

/**
 * Фабрика минимальных валидных DOCX для тестов рендера — вместо бинарных фикстур в git:
 * содержимое шаблона видно прямо в коде теста, дифф ревьюится глазами.
 * DOCX = zip c [Content_Types].xml + _rels/.rels + word/document.xml.
 */

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

/** Обычный параграф с одним прогоном текста. */
export function p(text: string): string {
  return `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
}

/** Параграф, в котором Word «разбил» текст на несколько прогонов (частый случай с тегами). */
export function splitRunsP(...chunks: string[]): string {
  const runs = chunks.map((c) => `<w:r><w:t xml:space="preserve">${c}</w:t></w:r>`).join('');
  return `<w:p>${runs}</w:p>`;
}

/** Собрать DOCX c данным содержимым <w:body>. */
export function buildDocx(bodyXml: string): Buffer {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${bodyXml}<w:sectPr/></w:body>
</w:document>`;
  const zip = new PizZip();
  zip.file('[Content_Types].xml', CONTENT_TYPES);
  zip.file('_rels/.rels', RELS);
  zip.file('word/document.xml', documentXml);
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/** Прочитать word/document.xml из готового DOCX (для ассертов). */
export function readDocumentXml(docx: Buffer): string {
  return new PizZip(docx).file('word/document.xml')!.asText();
}
