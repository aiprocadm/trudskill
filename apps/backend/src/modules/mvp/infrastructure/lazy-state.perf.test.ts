import { describe, expect, it } from 'vitest';

import { InMemoryMvpState } from './in-memory-mvp.state.js';

/**
 * §12.1 — сторож ленивой раскладки состояния центра. Третья задача плана
 * `2026-08-09-lenivoe-chtenie-sostoyaniya.md`, оставшаяся невыполненной.
 *
 * Что защищаем и почему это важно. Раньше каждый запрос раскладывал в память ВСЕ полсотни
 * коллекций центра и расшифровывал ПДн всех слушателей — даже когда открывали список групп.
 * Ленивая раскладка (раскладываем только то, к чему обратились) ускорила запросы под
 * нагрузкой в два раза: p95 при 50 сессиях 0,79 → 0,378 с.
 *
 * Беда в том, что вернуть жадность легко и незаметно: достаточно где-нибудь пробежаться по
 * всем коллекциям «на всякий случай» — например, при подсчёте, логировании или сохранении.
 * Тесты бизнес-логики этого не заметят: результат будет верным, просто медленным.
 *
 * ЗАМЕР, объясняющий цену (2026-08-19): расшифровка одного СНИЛС стоит ~64 мкс — и это цена
 * СРЕДЫ, а не нашего кода (чистый Node на `aes-256-gcm` даёт столько же). На 500 слушателях
 * это 27–32 мс на КАЖДЫЙ запрос. Оптимизировать саму расшифровку бессмысленно; единственный
 * способ не платить — не трогать коллекцию, которая запросу не нужна. Отсюда и этот сторож.
 */

const learners = [
  { id: 'lrn_1', tenantId: 't1', lastName: 'Иванов', snils: '112-233-445 95' },
  { id: 'lrn_2', tenantId: 't1', lastName: 'Петров', snils: '112-233-445 96' }
];
const groups = [{ id: 'grp_1', tenantId: 't1', code: 'ГР-1' }];

/** Собирает состояние с учётом раскладки, считая, сколько раз какую коллекцию раскладывали. */
const makeState = () => {
  const state = new InMemoryMvpState();
  const materialized: string[] = [];
  const raw = new Map<string, unknown[]>([
    ['learners', learners],
    ['groups', groups],
    ['enrollments', [{ id: 'enr_1', tenantId: 't1' }]]
  ]);
  state.setRawSnapshot(raw, (collection, items) => {
    materialized.push(collection);
    return [...items];
  });
  return { state, materialized };
};

describe('ленивая раскладка состояния центра (§12.1)', () => {
  it('до первого обращения не раскладывается ничего', () => {
    const { materialized } = makeState();
    expect(
      materialized,
      'Раскладка началась до того, как её попросили: значит запрос снова платит за всё состояние'
    ).toEqual([]);
  });

  /*
   * Ключевая проверка. Список групп не должен поднимать в память слушателей — а именно за
   * них платится расшифровкой ПДн.
   */
  it('чтение одной коллекции не трогает соседние', () => {
    const { state, materialized } = makeState();

    expect(state.groups).toHaveLength(1);

    expect(materialized).toEqual(['groups']);
    expect(
      materialized,
      'Чтение групп разложило чужие коллекции. Каждая лишняя — это копии объектов, а для ' +
        'слушателей ещё и расшифровка ПДн: ~64 мкс на запись, 27+ мс на пятистах.'
    ).not.toContain('learners');
  });

  it('повторное чтение не раскладывает заново', () => {
    const { state, materialized } = makeState();
    void state.groups;
    void state.groups;
    void state.groups;
    expect(materialized).toEqual(['groups']);
  });

  it('к чему обратились — то и попадает в список тронутых', () => {
    const { state } = makeState();
    void state.groups;
    void state.learners;
    expect(state.touchedCollections().sort()).toEqual(['groups', 'learners']);
  });

  /*
   * Вторая половина инварианта: сохранение не должно записывать коллекции, к которым никто
   * не обращался. Нетронутая измениться не могла — писать её значит гонять данные впустую.
   */
  it('нетронутая коллекция не считается изменённой', () => {
    const { state } = makeState();
    void state.groups;

    expect(state.hasChanged('learners'), 'нетронутых слушателей объявили изменёнными').toBe(false);
    expect(state.hasChanged('groups'), 'тронутая, но не изменённая коллекция').toBe(false);
  });

  it('тронутая и изменённая коллекция видна как изменённая', () => {
    const { state } = makeState();
    state.groups.push({ id: 'grp_2', tenantId: 't1', code: 'ГР-2' } as never);
    expect(state.hasChanged('groups')).toBe(true);
  });

  /*
   * Явная пометка нужна там, где значение в памяти выглядит прежним, а записать его надо.
   * Так работает дошифровка старых записей: в памяти СНИЛС расшифрован и «не менялся»,
   * но в базе он ещё лежит открытым текстом и обязан быть перезаписан.
   */
  it('явно помеченная коллекция записывается, даже если выглядит неизменной', () => {
    const { state } = makeState();
    void state.learners;
    expect(state.hasChanged('learners')).toBe(false);
    state.markDirty('learners');
    expect(
      state.hasChanged('learners'),
      'Пометка «записать обязательно» перестала работать: старые незашифрованные ПДн ' +
        'останутся в базе открытым текстом'
    ).toBe(true);
  });
});
