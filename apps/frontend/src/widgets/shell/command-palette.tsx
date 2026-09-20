'use client';

import { Icon } from '@trudskill/ui';
import { useRouter } from 'next/navigation';
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';

import { type CommandItem, filterCommands } from '../../features/navigation/command-palette';
import { SearchIcon } from '../../features/navigation/nav-icons';
import {
  type DataHit,
  SEARCH_EMPTY_HINT,
  searchData,
  searchEmptyResult
} from '../../features/search/data-search';

interface CommandPaletteProps {
  open: boolean;
  items: CommandItem[];
  onClose: () => void;
}

export const CommandPalette = ({ open, items, onClose }: CommandPaletteProps) => {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const results = useMemo(() => filterCommands(items, query), [items, query]);
  /*
   * ТЗ 3.6: кроме разделов ищем ДАННЫЕ — слушателей, группы, курсы, компании, документы.
   * Человек вводит «серт» или фамилию и ждёт свои записи, а не список пунктов меню
   * (журнал 590).
   *
   * Запрос уходит на сервер: область поиска считается по правам там, а не здесь. Скрыть лишнее
   * на экране недостаточно — данные к тому моменту уже ушли из системы.
   */
  const [dataHits, setDataHits] = useState<DataHit[]>([]);
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    /*
     * Пауза перед запросом: поиск зовут на каждое нажатие клавиши, и без неё «Иванов» — это
     * шесть запросов, из которых пять никому не нужны.
     */
    const timer = setTimeout(() => {
      void searchData(query)
        .then((hits) => {
          if (!cancelled) setDataHits(hits);
        })
        .catch(() => {
          /* Поиск по данным не должен ломать переход по разделам: он остаётся работать. */
          if (!cancelled) setDataHits([]);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, query]);

  // Сброс и автофокус при каждом открытии.
  useEffect(() => {
    if (!open) return undefined;
    setQuery('');
    setActiveIndex(0);
    const raf = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(raf);
  }, [open]);

  // Держим активный индекс в границах результата.
  useEffect(() => {
    setActiveIndex((i) => (results.length === 0 ? 0 : Math.min(i, results.length - 1)));
  }, [results.length]);

  if (!open) return null;

  const commit = (item: CommandItem | undefined) => {
    if (!item) return;
    onClose();
    router.push(item.href);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      commit(results[activeIndex]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  const activeId = results[activeIndex] ? `cmd-opt-${activeIndex}` : undefined;

  return (
    <div className="cmdk">
      <button type="button" className="cmdk__scrim" aria-label="Закрыть поиск" onClick={onClose} />
      <div
        className="cmdk__dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Быстрый переход по разделам"
      >
        <div className="cmdk__input-row">
          <Icon icon={SearchIcon} size={20} />
          <input
            ref={inputRef}
            className="cmdk__input"
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="cmdk-listbox"
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            placeholder="Поиск: фамилия, номер документа, группа…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>
        <ul className="cmdk__list" id="cmdk-listbox" role="listbox" aria-label="Разделы">
          {query.trim().length === 0 && results.length === 0 ? (
            /* ТЗ 3.6, пункт 4: пустой запрос объясняет, что вообще можно искать. */
            <li className="cmdk__empty">{SEARCH_EMPTY_HINT}</li>
          ) : results.length === 0 && dataHits.length === 0 ? (
            /* И пустой результат — тоже: «Ничего не найдено» не говорит, что делать дальше. */
            <li className="cmdk__empty">{searchEmptyResult(query.trim())}</li>
          ) : (
            results.map((item, index) => (
              // Клавиатура обрабатывается на input (combobox + aria-activedescendant);
              // опции кликабельны только мышью — это корректный ARIA-паттерн listbox.
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events
              <li
                key={item.href}
                id={`cmd-opt-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                className={`cmdk__option ${index === activeIndex ? 'is-active' : ''}`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => commit(item)}
              >
                <span className="cmdk__option-label">{item.label}</span>
                {item.group ? <span className="cmdk__option-group">{item.group}</span> : null}
              </li>
            ))
          )}
          {/*
            Найденные ДАННЫЕ идут после разделов и подписаны своим типом: человек должен видеть,
            что перед ним слушатель, а не одноимённый курс (ТЗ 3.6).
          */}
          {dataHits.map((hit) => (
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events
            <li
              key={`${hit.entity}:${hit.id}`}
              role="option"
              aria-selected={false}
              className="cmdk__option"
              data-testid="search-data-hit"
              onClick={() => {
                onClose();
                router.push(hit.href);
              }}
            >
              <span className="cmdk__option-label">{hit.title}</span>
              <span className="cmdk__option-group">{hit.entityLabel}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
