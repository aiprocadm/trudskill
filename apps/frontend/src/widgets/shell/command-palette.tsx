'use client';

import { Icon } from '@trudskill/ui';
import { useRouter } from 'next/navigation';
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';

import { type CommandItem, filterCommands } from '../../features/navigation/command-palette';
import { SearchIcon } from '../../features/navigation/nav-icons';

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
          <Icon icon={SearchIcon} size={18} />
          <input
            ref={inputRef}
            className="cmdk__input"
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="cmdk-listbox"
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            placeholder="Поиск раздела…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>
        <ul className="cmdk__list" id="cmdk-listbox" role="listbox" aria-label="Разделы">
          {results.length === 0 ? (
            <li className="cmdk__empty">Ничего не найдено</li>
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
        </ul>
      </div>
    </div>
  );
};
