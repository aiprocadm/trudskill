'use client';

import { createContext, useContext } from 'react';

import type { ReactElement, ReactNode } from 'react';

/**
 * Работа «от имени» — общий признак для компонентов пакета (ТЗ «Стабилизация, UX и развитие», 13.5).
 *
 * **Зачем контекст, а не свойство у каждого вызова.** Пометку обязано получить КАЖДОЕ
 * подтверждение опасного действия, а зовут его из десятка экранов. Свойство пришлось бы
 * передавать в каждом из них — и первый же новый экран про него забыл бы, причём молча:
 * подтверждение выглядело бы обычным, а действие ушло бы от чужого имени.
 *
 * **Почему пакет не читает сессию сам.** `@trudskill/ui` не знает и не должен знать про
 * устройство входа: он рисует, а не решает, кто вошёл. Значение кладёт оболочка приложения —
 * там, где сессия и так есть.
 *
 * Без провайдера режим считается выключенным: обычная работа не требует ничего настраивать.
 */
const ImpersonationContext = createContext<{ note?: string }>({});

export const ImpersonationProvider = ({
  note,
  children
}: {
  /** Пометка для подтверждений. Пусто — обычная работа. */
  note?: string;
  children: ReactNode;
}): ReactElement => (
  <ImpersonationContext.Provider value={note === undefined ? {} : { note }}>
    {children}
  </ImpersonationContext.Provider>
);

/** Пометка, которую подтверждение обязано показать, или `undefined` при обычной работе. */
export const useImpersonationNote = (): string | undefined => useContext(ImpersonationContext).note;
