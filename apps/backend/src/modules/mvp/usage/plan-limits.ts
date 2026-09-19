/**
 * Пороги предупреждений о лимите тарифа — настройка платформы, а не числа в коде
 * (ТЗ «Стабилизация, UX и развитие», 13.2, решение владельца Р13).
 *
 * **Правило репозитория:** всё, что выглядит как порог, реализуется настройкой со значением по
 * умолчанию. Здесь это особенно уместно: 80 % выбраны не из математики, а из опыта — это тот
 * запас, за который центр успевает докупить тариф до того, как упрётся. Платформе, которая
 * работает иначе, нужно уметь поменять это, не трогая код.
 */

/** Состояние потребления — по нему решают, что показать человеку и что запретить. */
export type UsageState = 'ok' | 'warning' | 'reached' | 'exceeded';

export interface LimitThresholds {
  /** С какой доли лимита предупреждать (в процентах). */
  warnAtPercent: number;
}

export const LIMIT_DEFAULTS: LimitThresholds = { warnAtPercent: 80 };

/** Ключ в свободном наборе настроек платформы. */
export const LIMIT_SETTINGS_KEY = 'planLimitThresholds';

const readPercent = (raw: unknown): number | null => {
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  /* Ниже 1 % предупреждение стало бы вечным, выше 99 % — бесполезным. */
  if (rounded < 1 || rounded > 99) return null;
  return rounded;
};

export const limitThresholds = (payload: Record<string, unknown> | undefined): LimitThresholds => {
  const raw = (payload?.[LIMIT_SETTINGS_KEY] as Record<string, unknown> | undefined)?.warnAtPercent;
  return { warnAtPercent: readPercent(raw) ?? LIMIT_DEFAULTS.warnAtPercent };
};

/**
 * Состояние статьи потребления (решение Р13).
 *
 * Безлимит — всегда «ok»: у статьи без потолка порог предупреждения не имеет смысла.
 * «reached» и «exceeded» разделены намеренно: первое — «место кончилось ровно», второе —
 * «его уже не хватает». Человеку это разные новости, и вторая требует другого тона.
 */
export const usageState = (
  used: number,
  limit: number | null,
  thresholds: LimitThresholds = LIMIT_DEFAULTS
): UsageState => {
  if (limit === null || limit <= 0) return 'ok';
  if (used > limit) return 'exceeded';
  if (used === limit) return 'reached';
  return used * 100 >= limit * thresholds.warnAtPercent ? 'warning' : 'ok';
};

/**
 * Что сказать человеку про состояние — словами, а не процентами.
 *
 * **Главное здесь — вторая половина каждой фразы.** Решение Р13 прямо перечисляет, что НИКОГДА
 * не прекращается: доступ уже обучающихся к материалам и экзаменам, выдача документов по
 * завершённому обучению, выгрузки в реестр. Обоснование владельца дословно: «заблокировать
 * выдачу удостоверения человеку, который уже отучился, — значит подставить центр перед его
 * клиентом и гарантированно потерять арендатора». Если об этом не написать на экране, центр
 * при первом же предупреждении решит, что у него сейчас встанет всё.
 */
export const usageNotice = (
  state: UsageState,
  used: number,
  limit: number | null
): { tone: 'none' | 'warning' | 'danger'; text: string } => {
  if (limit === null || state === 'ok') return { tone: 'none', text: '' };

  const keeps =
    'Обучение идущих групп, выдача документов уже отучившимся и выгрузки в реестр продолжаются в любом случае.';

  if (state === 'warning') {
    return {
      tone: 'warning',
      text: `Использовано ${used} из ${limit} по тарифу. Когда место закончится, нельзя будет добавлять новых слушателей и запускать новые группы. ${keeps}`
    };
  }
  if (state === 'reached') {
    return {
      tone: 'danger',
      text: `Место по тарифу закончилось: ${used} из ${limit}. Новых слушателей добавить и новые группы запустить нельзя. ${keeps}`
    };
  }
  return {
    tone: 'danger',
    text: `Тариф превышен: ${used} при лимите ${limit}. Новых слушателей добавить и новые группы запустить нельзя. ${keeps}`
  };
};

/** Можно ли сейчас заводить новое — единственное, что ограничивает превышение (Р13). */
export const canAddNew = (state: UsageState): boolean => state === 'ok' || state === 'warning';
