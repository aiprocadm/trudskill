import { readFileSync } from 'node:fs';

import { fileRejectionReason, fileRequirementsText } from '@trudskill/ui';
import { describe, expect, it } from 'vitest';

import { fromApp, fromPackages } from './app-root';
import { stripComments } from './backend-source';
import { SUBMISSION_ACCEPT, UPLOAD_MAX_SIZE_MB } from '../lib/files/limits';

/**
 * Загрузка файла человеческая (ТЗ «Стабилизация, UX и развитие», 5.9 / Э9).
 *
 * **Как было.** Выбор файла — одна кнопка и имя файла. Ни перетаскивания, ни съёмки с камеры,
 * ни превью, ни слова о том, какой файл примут и сколько он может весить. Слушатель на
 * телефоне снимал селфи, отправлял и узнавал об отказе после проверки — через повторную
 * подачу (журнал 469). Особенно больно это на «Подтверждении личности»: там снимают лицо и
 * паспорт, и оба раза с телефона.
 *
 * **Что закреплено.**
 *
 * 1. Компонент умеет перетаскивание, камеру, превью, требования словами, прогресс и понятную
 *    ошибку — всё необязательное, чтобы выбор файла в ячейке таблицы остался прежним.
 * 2. Неподходящий файл НЕ уходит наверх: причина называет и формат, и вес.
 * 3. Предел размера на экране совпадает с серверным — иначе экран обещает то, чего ручка не
 *    примет, и человек узнаёт об этом после долгой загрузки с телефона.
 * 4. Два экрана слушателя (личность, практическая работа) собраны крупной областью
 *    перетаскивания; на «Подтверждении личности» включена камера.
 */

const PICKER = fromPackages('ui', 'src', 'components', 'file-picker', 'index.tsx');
const FILES_SERVICE = fromApp('..', 'backend', 'src', 'modules', 'files', 'files.service.ts');
const IDENTITY = fromApp('src', 'features', 'identity-verification', 'screens.tsx');
const PRACTICAL = fromApp('src', 'features', 'practical-submissions', 'submission-screen.tsx');
const PATTERNS = fromApp('..', '..', 'docs', 'ui', 'patterns.md');

const read = (file: string): string => stripComments(readFileSync(file, 'utf8'));

/**
 * Свойство JSX ровно с таким именем и значением.
 *
 * Проверка подстрокой тут не годится: `capture="user"` содержится внутри
 * `data-capture="user"`, а `variant="dropzone"` — внутри `data-variant="dropzone"`. Четыре
 * подсаженные поломки прошли мимо первой редакции сторожа именно так (журнал 471).
 */
const propCount = (source: string, name: string, value: string): number =>
  (source.match(new RegExp(`(?<![\\w-])${name}=${value.replace(/[{}]/g, '\\$&')}`, 'g')) ?? [])
    .length;

describe('загрузка файла человеческая (ТЗ 5.9)', () => {
  it('компонент умеет всё, что просит ТЗ', () => {
    const source = read(PICKER);
    expect(propCount(source, 'onDrop', '{onDrop}'), 'перетаскивание').toBe(1);
    expect(source, 'съёмка с камеры на телефоне').toContain('capture');
    expect(source, 'предпросмотр выбранного').toContain('ui-file-preview');
    expect(source, 'ход отправки').toContain('ui-file-progress');
    expect(source, 'понятная ошибка').toContain('role="alert"');
  });

  it('требования показываются ДО выбора, а не после отказа', () => {
    expect(fileRequirementsText('image/png,image/jpeg', 10)).toBe('PNG или JPG, до 10 МБ');
    expect(fileRequirementsText(SUBMISSION_ACCEPT, UPLOAD_MAX_SIZE_MB)).toContain('до 10 МБ');
  });

  it('отказ называет и формат, и вес — иначе он не говорит, что делать', () => {
    expect(
      fileRejectionReason(
        { name: 'скан.tiff', type: 'image/tiff', size: 1000 },
        {
          accept: 'image/png,image/jpeg'
        }
      )
    ).toBe('Такой файл не подойдёт. Нужен PNG или JPG.');
    expect(
      fileRejectionReason(
        { name: 'селфи.jpg', type: 'image/jpeg', size: 12 * 1024 * 1024 },
        {
          maxSizeMb: UPLOAD_MAX_SIZE_MB
        }
      )
    ).toBe('Файл слишком большой: 12,0 МБ при пределе 10 МБ.');
  });

  it('предел на экране совпадает с серверным', () => {
    /*
     * Разойдись они — экран пообещал бы 20 МБ, а ручка отказала бы на 12-м: человек узнал бы
     * об этом после долгой загрузки с телефона, по мобильному интернету.
     */
    const service = readFileSync(FILES_SERVICE, 'utf8');
    const match = /SUBMISSION_MAX_BYTES\s*=\s*(\d+)\s*\*\s*1024\s*\*\s*1024/.exec(service);
    expect(match, 'серверный предел обязан находиться').not.toBeNull();
    expect(Number(match![1]), 'фронт и сервер про один и тот же предел').toBe(UPLOAD_MAX_SIZE_MB);
  });

  it('«Подтверждение личности»: камера, превью и область перетаскивания', () => {
    const source = read(IDENTITY);
    // `user` — фронтальная камера (лицо), `environment` — основная (документ).
    expect(propCount(source, 'capture', '"user"'), 'селфи снимается фронтальной').toBe(1);
    expect(propCount(source, 'capture', '"environment"'), 'паспорт — основной').toBe(1);
    // Полей два: и селфи, и паспорт несут с телефона.
    expect(propCount(source, 'variant', '"dropzone"'), 'оба поля — область перетаскивания').toBe(2);
    expect(source, 'превью: тот ли снимок выбран').toContain('previewUrl={selfiePreview}');
    expect(
      propCount(source, 'maxSizeMb', '{UPLOAD_MAX_SIZE_MB}'),
      'предел берётся общей настройкой у ОБОИХ полей'
    ).toBe(2);
    expect(
      /maxSizeMb=\{\d/.test(source),
      'число на месте разойдётся с сервером при первой же правке'
    ).toBe(false);
  });

  it('«Практическая работа»: область перетаскивания и требования', () => {
    const source = read(PRACTICAL);
    expect(propCount(source, 'variant', '"dropzone"')).toBe(1);
    expect(propCount(source, 'accept', '{SUBMISSION_ACCEPT}')).toBe(1);
    expect(propCount(source, 'maxSizeMb', '{UPLOAD_MAX_SIZE_MB}')).toBe(1);
  });

  it('отказ показывается у СВОЕГО поля, а не одной строкой на весь экран', () => {
    // Два поля рядом; общее сообщение не говорит, какой из файлов не подошёл.
    const source = read(IDENTITY);
    expect(source).toContain('error={selfieError}');
    expect(source).toContain('error={passportError}');
  });

  it('правило записано в docs/ui/patterns.md', () => {
    const doc = readFileSync(PATTERNS, 'utf8');
    expect(doc).toContain('## Э9');
    expect(doc).toContain('FilePicker');
  });
});
