import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getObjectCrumbServerSnapshot,
  getObjectCrumbSnapshot,
  objectCrumbFor,
  publishObjectCrumb,
  retractObjectCrumb,
  subscribeObjectCrumb
} from './object-crumb';

/** Шов «экран карточки → крошки оболочки» (ТЗ 3.5 / Н5). */
describe('object crumb store', () => {
  afterEach(() => {
    retractObjectCrumb('/groups/group_1');
    retractObjectCrumb('/groups/group_2');
  });

  it('имя действует только для своего адреса', () => {
    publishObjectCrumb('/groups/group_1', { status: 'ready', name: 'Группа 360px' });
    const snapshot = getObjectCrumbSnapshot();
    expect(objectCrumbFor(snapshot, '/groups/group_1')).toEqual({
      status: 'ready',
      name: 'Группа 360px'
    });
    /* Карточка Б ещё грузится — имя карточки А ей не достаётся. */
    expect(objectCrumbFor(snapshot, '/groups/group_2')).toBeNull();
  });

  it('уход с экрана снимает имя, чужую запись не трогает', () => {
    publishObjectCrumb('/groups/group_2', { status: 'ready', name: 'Вторая' });
    retractObjectCrumb('/groups/group_1');
    expect(objectCrumbFor(getObjectCrumbSnapshot(), '/groups/group_2')).toEqual({
      status: 'ready',
      name: 'Вторая'
    });
    retractObjectCrumb('/groups/group_2');
    expect(getObjectCrumbSnapshot()).toBeNull();
  });

  it('подписчик узнаёт о перемене и не дёргается впустую', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeObjectCrumb(listener);
    publishObjectCrumb('/groups/group_1', { status: 'loading' });
    publishObjectCrumb('/groups/group_1', { status: 'loading' }); // то же самое
    publishObjectCrumb('/groups/group_1', { status: 'ready', name: 'А' });
    publishObjectCrumb('/groups/group_1', { status: 'ready', name: 'А' }); // то же самое
    publishObjectCrumb('/groups/group_1', { status: 'ready', name: 'Б' });
    expect(listener).toHaveBeenCalledTimes(3);
    unsubscribe();
    retractObjectCrumb('/groups/group_1');
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('снимок стабилен между переменами — иначе useSyncExternalStore зациклится', () => {
    publishObjectCrumb('/groups/group_1', { status: 'ready', name: 'А' });
    expect(getObjectCrumbSnapshot()).toBe(getObjectCrumbSnapshot());
    expect(getObjectCrumbServerSnapshot()).toBeNull();
  });
});
