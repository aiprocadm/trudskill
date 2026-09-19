import { AA_NORMAL_TEXT, contrastRatio } from '@trudskill/ui';
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

  /*
   * UI-005: цвет текста на первичной кнопке считается ОТ цвета арендатора.
   *
   * Было: `--ui-on-accent` оставался тёмным (#0f172a) при любом фирменном цвете — правило
   * выведено для светлого коралла. Центр с тёмно-синим акцентом получал тёмный текст на
   * тёмной кнопке и не мог прочитать собственную первичную кнопку.
   */
  describe('текст на фирменной кнопке читается при любом цвете центра (UI-005)', () => {
    const cases: Array<{ color: string; expected: string; why: string }> = [
      { color: '#ff7a45', expected: '#0f172a', why: 'коралл платформы — светлый' },
      { color: '#1e3a8a', expected: '#ffffff', why: 'тёмно-синий — тот самый провальный случай' },
      { color: '#facc15', expected: '#0f172a', why: 'ярко-жёлтый' },
      { color: '#000000', expected: '#ffffff', why: 'чёрный' },
      { color: '#ffffff', expected: '#0f172a', why: 'белый' },
      /*
       * Точка перелома лежит НЕ на «половине шкалы»: на #808080 выигрывает ещё тёмный текст
       * (4.52:1 против 3.95:1), и лишь около #767676 выбор переворачивается на белый
       * (4.54:1 против 3.93:1). Так работает гамма-коррекция яркости — «серый ровно
       * посередине» на глаз и «серый посередине» по контрасту это разные цвета.
       */
      { color: '#808080', expected: '#0f172a', why: 'средне-серый, тёмный текст ещё выигрывает' },
      { color: '#767676', expected: '#ffffff', why: 'чуть темнее — выбор переворачивается' }
    ];

    for (const { color, expected, why } of cases) {
      it(`${color} (${why}) → текст ${expected}`, () => {
        const vars = brandingToThemeVars({ accentColor: color });
        expect(vars['--ui-on-accent']).toBe(expected);
        /*
         * Прежде здесь же проверялось равенство `--ui-hero-cta-text`: блок «Следующий шаг»
         * красился отдельной парой переменных с теми же значениями, и их приходилось держать
         * в согласии вручную. С ТЗ 7.4 коралл живёт ровно в одном месте — кнопка героя взяла
         * тот же акцент, — поэтому инвариант выполняется ПО ПОСТРОЕНИЮ, и охранять нечего
         * (журнал 566). Проверка не ослаблена: она переехала на фирменный цвет ниже, где
         * такая же развилка появилась впервые.
         */
      });
    }

    it('фирменный цвет центра тоже получает свой текст (ТЗ 7.4)', () => {
      /*
       * Фирменный цвет и акцент — РАЗНЫЕ цвета, и центр может задать только один. Пока
       * `--ui-on-brand` не считался, текст на фирменном фоне стоял белым хардкодом: центр со
       * светло-жёлтым фирменным цветом не мог прочитать ни активный шаг мастера, ни кружок с
       * инициалами, ни первичную кнопку (журнал 565).
       */
      expect(brandingToThemeVars({ brandColor: '#facc15' })['--ui-on-brand']).toBe('#0f172a');
      expect(brandingToThemeVars({ brandColor: '#1e3a8a' })['--ui-on-brand']).toBe('#ffffff');
      expect(
        brandingToThemeVars({ accentColor: '#facc15' })['--ui-on-brand'],
        'один акцент фирменный цвет не меняет — значит и текст на нём остаётся темой'
      ).toBeUndefined();
    });

    it('выбранный текст действительно проходит AA на этом цвете', () => {
      for (const { color } of cases) {
        const vars = brandingToThemeVars({ accentColor: color });
        const ratio = contrastRatio(vars['--ui-on-accent'] as string, color);
        expect(ratio, `цвет ${color}: контраст ${ratio}`).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      }
    });

    /*
     * UI-006 зафиксирован тестом, а не только словами: боковое меню НЕ отдаётся арендатору.
     * Иначе следующий заход «дочинит» это как недоделку, и светло-жёлтый фирменный цвет
     * сделает меню нечитаемым.
     */
    it('цвета бокового меню арендатору не отдаются (UI-006)', () => {
      const vars = brandingToThemeVars({ brandColor: '#facc15', accentColor: '#facc15' });
      const navVars = Object.keys(vars).filter((key) => key.startsWith('--ui-nav-'));
      expect(navVars, 'боковое меню остаётся тёмной поверхностью с гарантией контраста').toEqual(
        []
      );
    });
  });
});
