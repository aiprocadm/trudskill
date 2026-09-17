/**
 * Действия над строкой таблицы (`CMP-001`; ТЗ «Стабилизация, UX и развитие», 5.1 / Э1).
 *
 * **Как было.** Все действия строки печатались подряд подчёркнутыми ссылками: в «Арендаторах
 * платформы» четыре в ряд — «Включить работу центра», «Приостановить центр», «Перевести в
 * „В архиве“», «Войти от имени» — опасные красным, обычные синим, всё рядом.
 *
 * **Правило.** В строке максимум одно основное действие («Открыть»), остальное — в меню «…».
 * Опасные действия в этом меню внизу, отдельной секцией, красным. Единственное действие
 * показывается сразу: меню из одного пункта — два нажатия вместо одного.
 */
export interface RowAction {
  label: string;
  onSelect: () => void;
  /** Необратимое или опасное: в меню «…» внизу, красным. Никогда не показывается в строке. */
  danger?: boolean;
  disabled?: boolean;
  /** Основное действие строки — единственное, что стоит в строке само; не больше одного. */
  primary?: boolean;
}

export interface RowActionLayout {
  /** Что стоит в строке само: основное действие или единственное неопасное. */
  inline: RowAction | null;
  /** Обычные пункты меню «…». */
  menu: RowAction[];
  /** Опасные пункты меню «…» — внизу, отдельной секцией. */
  danger: RowAction[];
}

export const splitRowActions = (actions: readonly RowAction[]): RowActionLayout => {
  const primary = actions.find((action) => action.primary && !action.danger) ?? null;
  const rest = actions.filter((action) => action !== primary);
  if (!primary && rest.length === 1 && !rest[0]!.danger) {
    return { inline: rest[0]!, menu: [], danger: [] };
  }
  return {
    inline: primary,
    menu: rest.filter((action) => !action.danger),
    danger: rest.filter((action) => action.danger)
  };
};
