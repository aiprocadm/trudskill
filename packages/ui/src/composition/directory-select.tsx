import { SelectField } from './select-field.js';
import { SearchInput } from '../components/search/index.js';

import type { SelectFieldOption } from './select-field.js';
import type { ReactElement } from 'react';

/**
 * Выбор записи из справочника, который не врёт о том, что показывает.
 *
 * Обычный `<select>` над списком с сервера обманывает дважды. Во-первых, сервер отдаёт
 * СТРАНИЦУ, а не всё: у центра с тремя сотнями слушателей в списке окажется двести (потолок
 * запроса с проволоки, журнал 277), и человек решит, что остальных в системе нет. Во-вторых,
 * `<select>` с неизвестным значением молча показывает ПЕРВЫЙ пункт — уже выбранная запись,
 * выпавшая из показанных, подменяется соседней, и об этом никто не узнает.
 *
 * Здесь оба случая названы вслух:
 *   * поиск идёт на СЕРВЕРЕ (строка уходит наружу через `onQueryChange`), а не по показанным;
 *   * когда показано меньше, чем есть, подсказка называет оба числа и просит уточнить;
 *   * выбранная запись, которой нет среди показанных, получает собственный пункт.
 *
 * Заведено по записи 392 журнала расхождений.
 */
export const DirectorySelect = ({
  label,
  value,
  onChange,
  options,
  total,
  query,
  onQueryChange,
  isLoading = false,
  emptyLabel = '— не выбрано —',
  emptyHint,
  selectedLabel,
  searchLabel,
  searchPlaceholder,
  required = false
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Записи текущей страницы справочника — ровно то, что вернул сервер. */
  options: SelectFieldOption[];
  /** Сколько записей у сервера ВСЕГО по текущему запросу. */
  total?: number;
  query: string;
  onQueryChange: (query: string) => void;
  isLoading?: boolean;
  emptyLabel?: string;
  /** Что сказать, когда справочник пуст вовсе, — это не то же, что «ничего не найдено». */
  emptyHint?: string;
  /** Подпись выбранной записи, если её нет среди показанных. */
  selectedLabel?: string;
  searchLabel?: string;
  searchPlaceholder?: string;
  required?: boolean;
}): ReactElement => {
  const shown = options.length;
  const known = total ?? shown;

  /*
   * Выбранная запись могла выпасть из показанных — после поиска или потому, что не попала
   * на первую страницу. Без собственного пункта `<select>` показал бы первую строку списка,
   * и человек увидел бы чужое значение как своё.
   */
  const selectedMissing = value !== '' && !options.some((option) => option.value === value);
  const withSelected: SelectFieldOption[] = selectedMissing
    ? [{ value, label: selectedLabel ?? 'Выбранная ранее запись' }, ...options]
    : options;

  const hint = ((): string | undefined => {
    if (isLoading) return undefined;
    if (shown === 0) {
      return query.trim() ? 'Ничего не найдено. Измените запрос.' : emptyHint;
    }
    if (known > shown) {
      return `Показаны ${shown} из ${known}. Уточните поиск, чтобы найти нужную запись.`;
    }
    return emptyHint && shown === 0 ? emptyHint : undefined;
  })();

  return (
    <div className="ui-directory-select">
      <SearchInput
        value={query}
        onChange={onQueryChange}
        label={searchLabel ?? `Поиск: ${label.toLowerCase()}`}
        placeholder={searchPlaceholder ?? 'Начните вводить название'}
      />
      <SelectField
        label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        options={[{ value: '', label: isLoading ? 'Загружаем…' : emptyLabel }, ...withSelected]}
        {...(hint ? { hint } : {})}
        required={required}
        disabled={isLoading}
      />
    </div>
  );
};
