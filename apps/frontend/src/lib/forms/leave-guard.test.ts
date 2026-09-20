import { describe, expect, it } from 'vitest';

import {
  LEAVE_CONFIRM_CANCEL,
  LEAVE_CONFIRM_MESSAGE,
  LEAVE_CONFIRM_OK,
  LEAVE_CONFIRM_TITLE,
  leadsAwayFromForm,
  shouldGuardLeave
} from './leave-guard';

/**
 * Правила удержания на странице с незаполненной формой (ТЗ 10.3, журнал 591).
 *
 * **Ошибка здесь стоит дорого в ОБЕ стороны.** Пропустишь уход — человек потеряет работу.
 * Спросишь лишний раз — человек привыкнет отмахиваться от вопроса и потеряет работу всё
 * равно, но уже сам, нажав «Уйти» не глядя. Поэтому проверяется и то, и другое.
 */

const here = { currentPath: '/admin/courses/c-1' };

describe('что считается уходом со страницы (ТЗ 10.3)', () => {
  it('переход в другой раздел — уход', () => {
    expect(leadsAwayFromForm({ ...here, href: '/admin/learners' })).toBe(true);
  });

  it('та же страница с другими параметрами — не уход', () => {
    /*
     * Иначе вопрос «уйти без сохранения?» выскакивает при нажатии на заголовок колонки и на
     * переключении страницы списка. Это и есть самый быстрый способ обесценить вопрос.
     */
    expect(leadsAwayFromForm({ ...here, href: '/admin/courses/c-1?tab=modules' })).toBe(false);
    expect(leadsAwayFromForm({ ...here, href: '/admin/courses/c-1/' })).toBe(false);
  });

  it('якорь на этой же странице — не уход', () => {
    expect(leadsAwayFromForm({ ...here, href: '#modules' })).toBe(false);
  });

  it('новая вкладка — не уход: форма остаётся на месте', () => {
    expect(leadsAwayFromForm({ ...here, href: '/admin/learners', target: '_blank' })).toBe(false);
    expect(leadsAwayFromForm({ ...here, href: '/admin/learners', opensNewTab: true })).toBe(false);
  });

  it('скачивание файла — не уход', () => {
    expect(leadsAwayFromForm({ ...here, href: '/api/export.xlsx', hasDownload: true })).toBe(false);
  });

  it('внешний адрес и особые схемы оставлены браузеру', () => {
    /*
     * Уход на чужой сайт — полная перезагрузка, её перехватывает сам браузер. Спросить ещё и
     * здесь значило бы два вопроса подряд на одно действие.
     */
    expect(leadsAwayFromForm({ ...here, href: 'https://example.ru' })).toBe(false);
    expect(leadsAwayFromForm({ ...here, href: 'mailto:a@example.ru' })).toBe(false);
    expect(leadsAwayFromForm({ ...here, href: 'tel:+79990000000' })).toBe(false);
    expect(leadsAwayFromForm({ ...here, href: '//example.ru/x' })).toBe(false);
  });

  it('пустая ссылка ничего не значит', () => {
    expect(leadsAwayFromForm({ ...here, href: '' })).toBe(false);
  });
});

describe('когда удерживать (ТЗ 10.3)', () => {
  it('нетронутая форма не удерживает', () => {
    expect(shouldGuardLeave({ dirty: false })).toBe(false);
  });

  it('изменённая форма удерживает', () => {
    expect(shouldGuardLeave({ dirty: true })).toBe(true);
  });

  it('во время сохранения не удерживает', () => {
    /*
     * Иначе вопрос выскакивает на самом сохранении: форма ещё считается несохранённой, а
     * переход после успеха уже начался. Человек видит «уйти без сохранения?» ровно тогда,
     * когда он нажал «Сохранить», — и перестаёт верить вопросу.
     */
    expect(shouldGuardLeave({ dirty: true, saving: true })).toBe(false);
  });
});

describe('что человек прочитает (ТЗ 10.3, TXT-002/TXT-004)', () => {
  it('вопрос называет результат, а кнопки — действия', () => {
    expect(LEAVE_CONFIRM_TITLE).toBe('Уйти без сохранения?');
    expect(LEAVE_CONFIRM_OK).toMatch(/уйти/i);
    expect(LEAVE_CONFIRM_CANCEL).toMatch(/остаться/i);
  });

  it('пояснение говорит, что потеряется и что делать вместо', () => {
    /* «Вы уверены?» не сообщает человеку ничего, чего он не знает. */
    expect(LEAVE_CONFIRM_MESSAGE).toMatch(/не сохранен/i);
    expect(LEAVE_CONFIRM_MESSAGE).toMatch(/Сохранить/);
  });
});
