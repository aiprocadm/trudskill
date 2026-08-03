import { describe, expect, it } from 'vitest';

import { brandingToThemeVars, darkenHexColor, isHexColor, resolveWordmark } from './theme';

describe('branding theme (ФТ-D3.1)', () => {
  it('darkenHexColor затемняет каждый канал и не уходит ниже нуля', () => {
    expect(darkenHexColor('#ffffff', 0.5)).toBe('#808080');
    expect(darkenHexColor('#000000')).toBe('#000000');
    expect(darkenHexColor('#3b4fe4', 0.18)).toBe('#3041bb');
  });

  it('валидный бренд даёт переменные -600/-700 для brand и accent', () => {
    const vars = brandingToThemeVars({ brandColor: '#3B4FE4', accentColor: '#ff7a45' });
    expect(vars['--ui-brand-600']).toBe('#3b4fe4');
    expect(vars['--ui-brand-700']).toBe(darkenHexColor('#3b4fe4'));
    expect(vars['--ui-accent-600']).toBe('#ff7a45');
    expect(vars['--ui-accent-700']).toBe(darkenHexColor('#ff7a45'));
  });

  it('мусорные цвета отбрасываются молча — тема остаётся дефолтной', () => {
    expect(brandingToThemeVars({ brandColor: 'зелёненький' })).toEqual({});
    expect(brandingToThemeVars({ accentColor: '#12345' })).toEqual({});
    expect(brandingToThemeVars(null)).toEqual({});
    expect(brandingToThemeVars(undefined)).toEqual({});
  });

  it('каждый цвет валидируется независимо', () => {
    const vars = brandingToThemeVars({ brandColor: 'rgb(1,2,3)', accentColor: '#ff7a45' });
    expect(vars['--ui-brand-600']).toBeUndefined();
    expect(vars['--ui-accent-600']).toBe('#ff7a45');
  });

  it('resolveWordmark: имя бренда → иначе нейтральный wordmark платформы', () => {
    expect(resolveWordmark({ displayName: 'УЦ «Пример»' })).toBe('УЦ «Пример»');
    expect(resolveWordmark({ displayName: '   ' })).toBe('trudskill');
    expect(resolveWordmark(null)).toBe('trudskill');
  });

  it('isHexColor принимает только #rrggbb', () => {
    expect(isHexColor('#aabbcc')).toBe(true);
    expect(isHexColor('#AABBCC')).toBe(true);
    expect(isHexColor('#abc')).toBe(false);
    expect(isHexColor('aabbcc')).toBe(false);
  });
});
