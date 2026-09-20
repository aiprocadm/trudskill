import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { fromApp } from './app-root';
import {
  CONTACT_CENTER_HREF,
  CONTACT_CENTER_LABEL,
  type ExamResultView,
  dueUrgency,
  outcomeTone,
  scoreSummary
} from '../features/test-player/result-view';

/**
 * Экран результата проверки знаний (ТЗ «Стабилизация, UX и развитие», 10.4, пункт 5;
 * журнал 595).
 *
 * **Что было.** Экран показывал «Тест пройден / не пройден» и число набранных баллов. Ни
 * процента, ни проходного порога, ни времени прохождения, ни — главное — ответа на вопрос
 * «что дальше». Для регулируемого обучения последнее важнее всего: слушатель после неуда не
 * понимает, потерял ли он обучение целиком, и звонит в центр.
 *
 * В проекте нет средства монтировать компоненты (`RISK-002`), поэтому проверяются две вещи:
 * чистые правила показа и РАЗМЕТКА экрана по исходному тексту. Второе — не придирка: пункт 5
 * ТЗ перечисляет, что на экране обязано быть, и «обязано быть» проверяется только наличием.
 */

const screen = readFileSync(
  fromApp('src', 'features', 'test-player', 'test-result-screen.tsx'),
  'utf8'
);

const view = (over: Partial<ExamResultView> = {}): ExamResultView => ({
  outcome: 'retake_required',
  headline: 'Требуется повторная проверка знаний',
  nextStep: 'Нужна повторная проверка знаний — до 20 октября.',
  purposeLabel: 'Итоговая проверка знаний',
  scorePercent: 60,
  passingPercent: 80,
  scoreLine: '12 из 20',
  durationText: '42 минуты',
  topicsToRevise: ['Средства защиты'],
  showsAnswers: false,
  attemptsUsed: 1,
  attemptsLeft: 0,
  ...over
});

describe('правила показа итога (ТЗ 10.4)', () => {
  it('«требуется повторная проверка» — это внимание, а не ошибка', () => {
    /*
     * Красный означает «что-то сломалось». Здесь ничего не сломалось: человеку назначена
     * повторная проверка, и это предусмотренный Порядком № 2464 ход событий. Красная плашка
     * читается как приговор, а по решению Р9 неуд приговором не является.
     */
    expect(outcomeTone('retake_required')).toBe('warning');
    expect(outcomeTone('passed')).toBe('success');
    expect(outcomeTone('awaiting_review')).toBe('info');
  });

  it('процент показан рядом с порогом — человеку есть с чем сравнить', () => {
    expect(scoreSummary(view())).toContain('60%');
    expect(scoreSummary(view())).toContain('80%');
  });

  it('срочность считается по дням', () => {
    expect(dueUrgency(-1)).toBe('overdue');
    expect(dueUrgency(0)).toBe('soon');
    expect(dueUrgency(7)).toBe('soon');
    expect(dueUrgency(8)).toBe('calm');
    expect(dueUrgency(undefined)).toBeNull();
  });
});

describe('экран показывает всё, что перечислил ТЗ 10.4, пункт 5', () => {
  it('исход и «что дальше» — отдельным блоком', () => {
    expect(screen).toContain('headline');
    expect(screen, 'нет блока «Что дальше»').toContain('Что дальше');
    expect(screen, '«что дальше» не показано').toContain('view.nextStep');
  });

  it('«что дальше» стоит ВЫШЕ цифр', () => {
    /*
     * Порядок блоков и есть ответ на «что делать». Цифры объясняют исход, но решения не
     * меняют; человек, не сдавший проверку, пришёл сюда именно за сроком.
     */
    expect(screen.indexOf('Что дальше')).toBeLessThan(screen.indexOf('Как прошла проверка'));
  });

  it('процент, проходной порог и время прохождения', () => {
    expect(screen).toContain('scorePercent');
    expect(screen).toContain('passingPercent');
    expect(screen, 'нет времени прохождения').toContain('durationText');
  });

  it('кнопка «Написать в учебный центр» есть и ведёт в форму обращения', () => {
    /*
     * Прямое требование пункта 5. Ведёт в ту же форму, что и «Сообщить о проблеме» (15.5):
     * второй канал означал бы, что половина обращений приходит туда, куда центр не смотрит.
     */
    expect(CONTACT_CENTER_LABEL).toBe('Написать в учебный центр');
    expect(CONTACT_CENTER_HREF).toBe('/support/problem');
    expect(screen, 'кнопки обращения нет на экране').toContain('CONTACT_CENTER_LABEL');
    expect(screen).toContain('CONTACT_CENTER_HREF');
  });

  it('темы с ошибками показаны, а правильные ответы — нет', () => {
    /*
     * Р9, пункт 4. Если на экране появится разбор ответов, банк вопросов утечёт за несколько
     * попыток — а по этой проверке выдают документ, который предъявляют инспектору.
     */
    expect(screen).toContain('topicsToRevise');
    expect(screen, 'на экране появился разбор правильных ответов').not.toMatch(
      /правильн\w*\s+ответ/i
    );
  });

  it('просроченный срок объявляется голосом, а не только цветом', () => {
    /*
     * Цвет не читает ни программа чтения с экрана, ни человек, не различающий оттенки.
     * `role="alert"` — единственное, что делает просрочку слышимой.
     */
    expect(screen).toMatch(/role=\{urgency === 'overdue' \? 'alert' : 'status'\}/);
  });

  it('экран зовёт представление, а не сырую запись результата', () => {
    /*
     * «Построено и не подключено» — самая частая находка в этом коде. Здесь она выглядела бы
     * так: служба считает проценты и сроки, а экран по-прежнему рисует баллы.
     */
    expect(screen).toContain('useAttemptResultView');
    expect(screen, 'экран всё ещё читает сырую запись результата').not.toContain(
      'useAttemptResult('
    );
  });
});
