import type PizZip from 'pizzip';

/**
 * Вставка изображений в DOCX (ФТ-A7.1, Фаза 1 Task 9) — подпись руководителя и печать УЦ.
 *
 * Почему свой код, а не модуль docxtemplater: официальный image-модуль платный, а
 * бесплатный community-модуль (`docxtemplater-image-module-free`, 2019 г.) написан под
 * старый module-API и с docxtemplater 3.69 не работает. Нам нужна ещё и гарантия
 * байт-детерминизма (ФТ-A1.4) — сторонний модуль её не даёт, а здесь мы полностью
 * контролируем имена медиа-файлов, id связей и порядок записей zip.
 *
 * Механика: рендер подставляет вместо тега `{%tenant.stamp_image}` текстовый маркер,
 * а этот модуль уже в готовом документе меняет маркер на настоящий `<w:drawing>`,
 * дописывая в пакет медиа-файл, связь (`.rels`) и тип содержимого.
 */

/** Маркер, который движок кладёт вместо тега-картинки; уникален и валиден в XML. */
export const IMAGE_MARKER_PREFIX = '[[docx-image:';
export const IMAGE_MARKER_SUFFIX = ']]';

/** Картинка, которую вызывающий код передаёт под именем переменной. */
export interface DocxImage {
  /** Байты файла (PNG или JPEG). */
  data: Buffer;
  /** MIME: `image/png` или `image/jpeg`. */
  contentType: string;
  /**
   * Ширина на бланке в миллиметрах; высота считается по пропорциям файла.
   * Не задана — берём натуральный размер картинки из расчёта 96 dpi.
   */
  widthMm?: number;
}

/** Проблема с самой картинкой (битый файл, неподдерживаемый формат) — терминальна. */
export class DocxImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocxImageError';
  }
}

const EMU_PER_MM = 36000;
/** 914400 EMU в дюйме / 96 пикселей в дюйме — экранное разрешение по умолчанию. */
const EMU_PER_PX = 9525;

const RENDERABLE_PART = /^word\/([A-Za-z0-9]+)\.xml$/;

interface PixelSize {
  width: number;
  height: number;
}

/** Размер PNG — из обязательного первого чанка IHDR. */
function readPngSize(data: Buffer): PixelSize | undefined {
  const PNG_SIGNATURE = '89504e470d0a1a0a';
  if (data.length < 24 || data.subarray(0, 8).toString('hex') !== PNG_SIGNATURE) return undefined;
  if (data.subarray(12, 16).toString('ascii') !== 'IHDR') return undefined;
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

/** Размер JPEG — из первого маркера SOFn (кадр); остальные секции пропускаем по длине. */
function readJpegSize(data: Buffer): PixelSize | undefined {
  if (data.length < 4 || data.readUInt16BE(0) !== 0xffd8) return undefined;
  let pos = 2;
  while (pos + 9 < data.length) {
    if (data[pos] !== 0xff) {
      pos += 1;
      continue;
    }
    const marker = data[pos + 1]!;
    // SOF0..SOF15 несут размеры кадра; C4/C8/CC — таблицы Хаффмана и расширения, не кадр.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { width: data.readUInt16BE(pos + 7), height: data.readUInt16BE(pos + 5) };
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      pos += 2;
      continue;
    }
    const segmentLength = data.readUInt16BE(pos + 2);
    if (segmentLength < 2) return undefined;
    pos += 2 + segmentLength;
  }
  return undefined;
}

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/jpg': 'jpeg'
};

/** Размер картинки на бланке в EMU (единицы Office) с сохранением пропорций. */
export function imageExtentEmu(image: DocxImage): { cx: number; cy: number } {
  const pixels =
    EXTENSION_BY_MIME[image.contentType] === 'png'
      ? readPngSize(image.data)
      : readJpegSize(image.data);
  if (!pixels || pixels.width <= 0 || pixels.height <= 0) {
    throw new DocxImageError(
      `не удалось прочитать размеры изображения (${image.contentType}); поддерживаются PNG и JPEG`
    );
  }
  const cx =
    image.widthMm && image.widthMm > 0
      ? Math.round(image.widthMm * EMU_PER_MM)
      : pixels.width * EMU_PER_PX;
  const cy = Math.round((cx * pixels.height) / pixels.width);
  return { cx, cy };
}

/**
 * MIME по сигнатуре файла — когда хранилище отдало байты без типа содержимого.
 * `undefined` = формат не наш, вставлять нельзя.
 */
export function detectImageContentType(data: Buffer): string | undefined {
  if (readPngSize(data)) return 'image/png';
  if (readJpegSize(data)) return 'image/jpeg';
  return undefined;
}

/** Имя медиа-файла в пакете — детерминированное, из имени переменной. */
function mediaName(variableName: string, extension: string): string {
  return `${variableName.replace(/[^A-Za-z0-9]+/g, '-')}.${extension}`;
}

function drawingXml(relationshipId: string, docPrId: number, cx: number, cy: number): string {
  // Пространства имён объявляем прямо на элементах: бланки от разных редакторов
  // объявляют в корне document.xml разный набор, полагаться на него нельзя.
  return (
    '<w:drawing>' +
    '<wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"' +
    ' distT="0" distB="0" distL="0" distR="0">' +
    `<wp:extent cx="${cx}" cy="${cy}"/>` +
    `<wp:docPr id="${docPrId}" name="Image${docPrId}"/>` +
    '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
    '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    `<pic:nvPicPr><pic:cNvPr id="${docPrId}" name="Image${docPrId}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    '<pic:blipFill>' +
    '<a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"' +
    ` r:embed="${relationshipId}"/>` +
    '<a:stretch><a:fillRect/></a:stretch>' +
    '</pic:blipFill>' +
    '<pic:spPr>' +
    `<a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>' +
    '</pic:spPr>' +
    '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>'
  );
}

const EMPTY_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';

/** Дописать связь на медиа-файл и вернуть её id (для существующей картинки — прежний). */
function ensureRelationship(zip: PizZip, relsPath: string, target: string): string {
  const existing = zip.file(relsPath)?.asText() ?? EMPTY_RELS;
  const alreadyThere = existing.match(
    new RegExp(`Id="([^"]+)"[^>]*Target="${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`)
  );
  if (alreadyThere) return alreadyThere[1]!;
  const usedNumbers = [...existing.matchAll(/Id="rId(\d+)"/g)].map((m) => Number(m[1]));
  const relationshipId = `rId${Math.max(0, ...usedNumbers) + 1}`;
  const relationship =
    `<Relationship Id="${relationshipId}"` +
    ' Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"' +
    ` Target="${target}"/>`;
  zip.file(relsPath, existing.replace('</Relationships>', `${relationship}</Relationships>`));
  return relationshipId;
}

/** Объявить тип содержимого расширения — иначе Word считает пакет повреждённым. */
function ensureContentType(zip: PizZip, extension: string): void {
  const path = '[Content_Types].xml';
  const xml = zip.file(path)?.asText();
  if (!xml || xml.includes(`Extension="${extension}"`)) return;
  const mime = extension === 'png' ? 'image/png' : 'image/jpeg';
  zip.file(
    path,
    xml.replace('</Types>', `<Default Extension="${extension}" ContentType="${mime}"/></Types>`)
  );
}

/**
 * Заменить маркеры картинок в уже отрендеренном пакете на настоящие изображения.
 * Маркер всегда лежит внутри `<w:t>` одного прогона (его положил туда рендер), поэтому
 * прогон разрезается: текст до маркера → отдельный прогон с картинкой → текст после.
 */
export function embedImages(zip: PizZip, images: Record<string, DocxImage>): void {
  const parts = Object.keys(zip.files).filter((name) => RENDERABLE_PART.test(name));
  let docPrId = 1;
  const usedExtensions = new Set<string>();

  for (const part of parts.sort()) {
    const xml = zip.file(part)?.asText();
    if (!xml || !xml.includes(IMAGE_MARKER_PREFIX)) continue;
    const relsPath = part.replace(RENDERABLE_PART, 'word/_rels/$1.xml.rels');
    const markerPattern = new RegExp(
      `${IMAGE_MARKER_PREFIX.replace(/[[\]]/g, '\\$&')}([^\\]]+)${IMAGE_MARKER_SUFFIX.replace(/[[\]]/g, '\\$&')}`,
      'g'
    );

    const replaced = xml.replace(markerPattern, (whole, variableName: string) => {
      const image = images[variableName];
      if (!image) return '';
      const extension = EXTENSION_BY_MIME[image.contentType];
      if (!extension) {
        throw new DocxImageError(
          `переменная {%${variableName}}: формат ${image.contentType} не поддерживается (нужен PNG или JPEG)`
        );
      }
      const { cx, cy } = imageExtentEmu(image);
      const name = mediaName(variableName, extension);
      zip.file(`word/media/${name}`, image.data);
      usedExtensions.add(extension);
      const relationshipId = ensureRelationship(zip, relsPath, `media/${name}`);
      const drawing = drawingXml(relationshipId, docPrId, cx, cy);
      docPrId += 1;
      // Разрезаем прогон: закрываем текущий <w:t>/<w:r>, вставляем картинку, открываем новый.
      return `</w:t></w:r><w:r>${drawing}</w:r><w:r><w:t xml:space="preserve">`;
    });

    zip.file(part, replaced);
  }

  for (const extension of usedExtensions) ensureContentType(zip, extension);
}
