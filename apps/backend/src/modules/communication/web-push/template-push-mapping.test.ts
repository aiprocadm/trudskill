import { describe, expect, it } from 'vitest';

import { toPushNotification } from './template-push-mapping.js';

describe('toPushNotification', () => {
  it('title = subject; body = первая непустая строка', () => {
    const result = toPushNotification({
      subject: 'Курс завершён',
      body: 'Поздравляем!\nВторая строка игнорируется'
    });
    expect(result).toEqual({ title: 'Курс завершён', body: 'Поздравляем!' });
  });

  it('пропускает ведущие пустые строки', () => {
    const result = toPushNotification({ subject: 'S', body: '\n\n  \nПервая значимая' });
    expect(result.body).toBe('Первая значимая');
  });

  it('обрезает длинную строку до ~120 символов с многоточием', () => {
    const long = 'a'.repeat(200);
    const result = toPushNotification({ subject: 'S', body: long });
    expect(result.body.length).toBe(120);
    expect(result.body.endsWith('…')).toBe(true);
  });

  it('пробрасывает url, если передан', () => {
    const result = toPushNotification({ subject: 'S', body: 'B' }, { url: '/cabinet' });
    expect(result.url).toBe('/cabinet');
  });

  it('не добавляет url, если не передан', () => {
    const result = toPushNotification({ subject: 'S', body: 'B' });
    expect(result).not.toHaveProperty('url');
  });

  it('пустой body → пустой text', () => {
    const result = toPushNotification({ subject: 'S', body: '   \n  ' });
    expect(result.body).toBe('');
  });
});
