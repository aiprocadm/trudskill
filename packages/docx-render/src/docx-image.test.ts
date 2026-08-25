import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';

import { buildDocx, p, readDocumentXml, tinyPng } from './docx-fixture.js';
import { DocxImageError, imageExtentEmu } from './docx-image.js';
import { TemplateRenderError, extractTemplateTags, renderDocx } from './docx-render.js';

/**
 * Картинки в бланке (ФТ-A7.1, Фаза 1 Task 9): подпись руководителя и печать УЦ.
 * Проверяем не «строчку в XML», а то, из чего Word собирает пакет: рисунок в теле,
 * медиа-файл, связь на него и объявленный тип содержимого.
 */

const PNG = tinyPng(40, 20, [10, 20, 30]);
const stamp = { data: PNG, contentType: 'image/png' };

describe('renderDocx — картинки', () => {
  it('заменяет тег {%…} на рисунок с медиа-файлом, связью и типом содержимого', () => {
    const docx = renderDocx(
      buildDocx(p('Печать: {%tenant.stamp_image}')),
      {},
      {
        images: { 'tenant.stamp_image': stamp }
      }
    );

    const zip = new PizZip(docx);
    const xml = readDocumentXml(docx);
    expect(xml).toContain('<w:drawing>');
    expect(xml).not.toContain('docx-image');
    expect(xml).toContain('Печать: ');

    const media = zip.file('word/media/tenant-stamp-image.png');
    expect(media).toBeTruthy();
    expect(Buffer.from(media!.asUint8Array())).toEqual(PNG);

    const rels = zip.file('word/_rels/document.xml.rels')!.asText();
    expect(rels).toContain('Target="media/tenant-stamp-image.png"');
    expect(rels).toMatch(/Type="[^"]+\/image"/);

    // Связь, на которую ссылается рисунок, обязана существовать — иначе Word ругается.
    const embedId = /r:embed="([^"]+)"/.exec(xml)![1];
    expect(rels).toContain(`Id="${embedId}"`);

    expect(zip.file('[Content_Types].xml')!.asText()).toContain('Extension="png"');
  });

  it('переменная без картинки просто исчезает — документ выдаётся без печати', () => {
    const docx = renderDocx(buildDocx(p('Печать: {%tenant.stamp_image}')), {}, {});
    const xml = readDocumentXml(docx);
    expect(xml).not.toContain('<w:drawing>');
    expect(xml).not.toContain('docx-image');
    expect(xml).toContain('Печать: ');
  });

  it('две разные картинки получают разные связи, одна и та же — общий медиа-файл', () => {
    const body =
      p('{%tenant.signature_image} {%tenant.stamp_image}') + p('ещё раз {%tenant.stamp_image}');
    const docx = renderDocx(
      buildDocx(body),
      {},
      {
        images: {
          'tenant.signature_image': { data: tinyPng(30, 10, [1, 2, 3]), contentType: 'image/png' },
          'tenant.stamp_image': stamp
        }
      }
    );

    const zip = new PizZip(docx);
    expect(Object.keys(zip.files).filter((n) => n.startsWith('word/media/'))).toHaveLength(2);
    const rels = zip.file('word/_rels/document.xml.rels')!.asText();
    expect([...rels.matchAll(/Target="media\//g)]).toHaveLength(2);
    // Три вставки рисунка на два файла: повтор переиспользует связь.
    expect([...readDocumentXml(docx).matchAll(/<w:drawing>/g)]).toHaveLength(3);
  });

  it('повторный рендер тех же данных даёт байт-в-байт тот же файл (ФТ-A1.4)', () => {
    const template = buildDocx(p('{%tenant.stamp_image}'));
    const first = renderDocx(template, {}, { images: { 'tenant.stamp_image': stamp } });
    const second = renderDocx(template, {}, { images: { 'tenant.stamp_image': stamp } });
    expect(first.equals(second)).toBe(true);
  });

  it('неподдерживаемый формат — понятная терминальная ошибка, а не падение рендера', () => {
    expect(() =>
      renderDocx(
        buildDocx(p('{%tenant.stamp_image}')),
        {},
        {
          images: { 'tenant.stamp_image': { data: PNG, contentType: 'image/svg+xml' } }
        }
      )
    ).toThrow(TemplateRenderError);
  });

  it('битый файл картинки — тоже понятная ошибка', () => {
    expect(() =>
      renderDocx(
        buildDocx(p('{%tenant.stamp_image}')),
        {},
        {
          images: {
            'tenant.stamp_image': { data: Buffer.from('не картинка'), contentType: 'image/png' }
          }
        }
      )
    ).toThrow(/размеры изображения/);
  });
});

describe('размер картинки на бланке', () => {
  it('ширина в миллиметрах, высота — по пропорциям файла', () => {
    // 40×20 px → соотношение 2:1; при ширине 50 мм высота обязана быть 25 мм.
    expect(imageExtentEmu({ data: PNG, contentType: 'image/png', widthMm: 50 })).toEqual({
      cx: 50 * 36000,
      cy: 25 * 36000
    });
  });

  it('без указанной ширины берётся натуральный размер (96 dpi)', () => {
    expect(imageExtentEmu({ data: PNG, contentType: 'image/png' })).toEqual({
      cx: 40 * 9525,
      cy: 20 * 9525
    });
  });

  it('размер JPEG читается из маркера кадра', () => {
    // Минимальный JPEG-каркас: SOI + APP0 + SOF0 с размерами 24×12.
    const jpeg = Buffer.concat([
      Buffer.from([0xff, 0xd8]),
      Buffer.from([0xff, 0xe0, 0x00, 0x04, 0x00, 0x00]),
      Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x0c, 0x00, 0x18]),
      Buffer.alloc(16)
    ]);
    expect(imageExtentEmu({ data: jpeg, contentType: 'image/jpeg' })).toEqual({
      cx: 24 * 9525,
      cy: 12 * 9525
    });
  });

  it('не-картинка даёт DocxImageError', () => {
    expect(() => imageExtentEmu({ data: Buffer.alloc(4), contentType: 'image/png' })).toThrow(
      DocxImageError
    );
  });
});

describe('разбор бланка', () => {
  it('различает обычные теги и теги-картинки (ФТ-A3.2)', () => {
    const tags = extractTemplateTags(
      buildDocx(
        p('{tenant.name} {%tenant.stamp_image} {#group_learners}{full_name}{/group_learners}')
      )
    );
    expect(tags).toEqual([
      { name: 'tenant.name', kind: 'value' },
      { name: 'tenant.stamp_image', kind: 'image' },
      { name: 'group_learners', kind: 'value' },
      { name: 'full_name', kind: 'value' }
    ]);
  });
});
