import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TWO_FACTOR_STAGE,
  TWO_FACTOR_MAX_POSTPONES,
  resolveTwoFactorStage,
  twoFactorPrompt
} from './two-factor-policy.js';

/**
 * Двухфакторная защита предлагается, а не прячется (ТЗ 9.2, решение владельца Р7).
 *
 * **Что было.** Защита существовала и работала, но лежала в «Настройки → Профиль →
 * Безопасность» — тремя нажатиями от главного экрана, без единого слова о том, зачем она нужна.
 * Администратор должен был сам догадаться туда зайти. Неудивительно, что в ревью двухфакторная
 * защита оказалась выключенной у администратора центра (журнал 575).
 *
 * **Что закреплено.** Решение Р7: защита обязательна для администраторов платформы и центра и
 * вводится в три шага — предложение, просьба при входе с возможностью отложить, запрет входа
 * без неё. Шаг задаётся настройкой: переход это срок, а сроки в этом проекте настраиваются, а
 * не наступают выкладкой кода.
 *
 * **Слушателю защита не навязывается никогда.** Он заходит раз в несколько месяцев сдать
 * экзамен; требовать от него приложение-генератор кодов значит потерять его на входе.
 */

const here = dirname(fileURLToPath(import.meta.url));
const policySource = readFileSync(resolve(here, 'two-factor-policy.ts'), 'utf8');

const status = (over: Partial<Parameters<typeof twoFactorPrompt>[0]> = {}) => ({
  enabled: false,
  pending: false,
  eligible: true,
  ...over
});

describe('кому показывается приглашение (ТЗ 9.2, Р7)', () => {
  it('администратору без защиты — да', () => {
    expect(twoFactorPrompt(status())).not.toBeNull();
  });

  it('тому, у кого защита включена, — нет', () => {
    /*
     * Вежливая надпись «всё в порядке» занимала бы место на экране и ничего не добавляла.
     * Молчание здесь и есть правильный ответ.
     */
    expect(twoFactorPrompt(status({ enabled: true }))).toBeNull();
  });

  it('слушателю и другим ролям — никогда', () => {
    /*
     * Р7 прямо: остальным ролям защита добровольна, слушателю не навязывается. Он заходит раз
     * в несколько месяцев сдать экзамен, и требование приложения потеряло бы его на входе.
     */
    expect(twoFactorPrompt(status({ eligible: false }))).toBeNull();
    expect(twoFactorPrompt(status({ eligible: false, pending: true }))).toBeNull();
  });
});

describe('приглашение говорит, зачем это человеку (ТЗ 9.2, TXT-004)', () => {
  it('на первом шаге объясняет причину, а не ссылается на политику', () => {
    /*
     * «Требование политики безопасности» человека не убеждает и ничего не объясняет. Работает
     * другое: что именно он защищает и что случится, если пароль утечёт.
     */
    const prompt = twoFactorPrompt(status());
    expect(prompt?.tone).toBe('info');
    expect(prompt?.text).toMatch(/персональн|СНИЛС|паспорт/i);
    expect(prompt?.text, 'не сказано, что будет, если пароль попадёт к чужим').toMatch(/пароль/i);
    expect(prompt?.text, 'канцелярит вместо объяснения').not.toMatch(/политик[аи] безопасности/i);
  });

  it('кнопка называет результат, а не действие над системой', () => {
    /* «Настроить TOTP» — это про систему. «Подключить защиту» — про то, что получит человек. */
    const prompt = twoFactorPrompt(status());
    expect(prompt?.actionLabel).toBe('Подключить защиту');
    expect(prompt?.actionLabel).not.toMatch(/TOTP|2FA/i);
  });

  it('незавершённая настройка — отдельный случай', () => {
    /*
     * Человек уже отсканировал код и бросил на полпути. Уговаривать его незачем — нужно
     * сказать, что осталось одно действие и что защита ПОКА НЕ РАБОТАЕТ.
     */
    const prompt = twoFactorPrompt(status({ pending: true }));
    expect(prompt?.tone).toBe('warning');
    expect(prompt?.actionLabel).toBe('Завершить настройку');
    expect(prompt?.text).toMatch(/не работает/i);
  });
});

describe('три шага ввода обязательной защиты (Р7)', () => {
  it('по умолчанию идёт первый шаг — предложение', () => {
    expect(DEFAULT_TWO_FACTOR_STAGE).toBe('offer');
    expect(twoFactorPrompt(status(), 'offer')?.tone).toBe('info');
  });

  it('второй шаг предупреждает о скором запрете', () => {
    const prompt = twoFactorPrompt(status(), 'nudge');
    expect(prompt?.tone).toBe('warning');
    expect(prompt?.text).toMatch(/скоро/i);
  });

  it('третий шаг говорит, что вход уже невозможен', () => {
    const prompt = twoFactorPrompt(status(), 'required');
    expect(prompt?.tone).toBe('warning');
    expect(prompt?.text).toMatch(/невозможен/i);
  });

  it('шаг задаётся настройкой, а не выкладкой кода', () => {
    /*
     * Переход со шага на шаг — это срок, а всё, что выглядит как срок, в этом проекте
     * делается настройкой со значением по умолчанию. Иначе второй шаг наступает тогда, когда
     * про него вспомнят.
     */
    expect(resolveTwoFactorStage('nudge')).toBe('nudge');
    expect(resolveTwoFactorStage('required')).toBe('required');
  });

  it('непонятное значение настройки не делает защиту строже сама собой', () => {
    /*
     * Опечатка в настройке не должна запереть администраторов снаружи. Неизвестное значение
     * откатывается к самому мягкому шагу, а не к самому строгому.
     */
    expect(resolveTwoFactorStage('внезапно')).toBe('offer');
    expect(resolveTwoFactorStage(null)).toBe('offer');
    expect(resolveTwoFactorStage(7)).toBe('offer');
  });

  it('число отсрочек — то, что назвал владелец', () => {
    expect(TWO_FACTOR_MAX_POSTPONES).toBe(3);
  });
});

describe('предупреждение ТЗ выполнено: issuer не трогаем (ТЗ 9.2)', () => {
  it('политика не задаёт и не меняет issuer', () => {
    /*
     * Прямое предупреждение ТЗ: у тех, кто уже подключил защиту, привязанные приложения
     * перестали бы давать верные коды, и люди остались бы заперты снаружи.
     */
    expect(policySource, 'политика трогает issuer').not.toMatch(/issuer\s*[:=]/i);
  });

  it('причина записана рядом, а не в чужой голове', () => {
    expect(policySource).toMatch(/[Ii]ssuer/);
  });
});

describe('приглашение доезжает до экрана (ТЗ 9.2)', () => {
  /*
   * «Построено и не подключено» — самая частая находка в этом коде. Сам текст проверяется
   * выше; здесь проверяется, что его КТО-ТО показывает.
   */
  const service = readFileSync(resolve(here, 'services', 'auth.service.ts'), 'utf8');
  const card = readFileSync(
    resolve(
      here,
      '..',
      '..',
      '..',
      '..',
      'frontend',
      'src',
      'features',
      'auth',
      'two-factor-card.tsx'
    ),
    'utf8'
  );

  it('сервер кладёт приглашение в ответ о состоянии защиты', () => {
    expect(service).toMatch(/prompt: twoFactorPrompt\(status, DEFAULT_TWO_FACTOR_STAGE\)/);
  });

  it('карточка показывает его первым, до переключателей', () => {
    const cardBody = card.slice(card.indexOf('data-testid="totp-card"'));
    const promptAt = cardBody.indexOf('data-testid="totp-prompt"');
    const toggleAt = cardBody.indexOf('status.enabled ?');
    expect(promptAt, 'приглашение не показывается вовсе').toBeGreaterThan(-1);
    expect(
      promptAt,
      'приглашение стоит после настройки, смысла которой человек не знает'
    ).toBeLessThan(toggleAt);
  });
});
