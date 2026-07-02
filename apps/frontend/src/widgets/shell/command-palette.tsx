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
      <style jsx>{`
        .cmdk {
          position: fixed;
          inset: 0;
          z-index: 13000;
          display: flex;
          justify-content: center;
          align-items: flex-start;
          padding-top: 12vh;
        }
        .cmdk__scrim {
          position: absolute;
          inset: 0;
          border: none;
          padding: 0;
          margin: 0;
          background: rgba(15, 23, 42, 0.45);
          cursor: pointer;
        }
        .cmdk__dialog {
          position: relative;
          width: min(560px, 92vw);
          background: var(--ui-surface);
          border: 1px solid var(--ui-border);
          border-radius: 14px;
          box-shadow: var(--ui-shadow-strong);
          overflow: hidden;
        }
        .cmdk__input-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 14px 16px;
          border-bottom: 1px solid var(--ui-border);
          color: var(--ui-text-muted);
        }
        .cmdk__input {
          flex: 1 1 auto;
          border: none;
          outline: none;
          background: transparent;
          font-size: 16px;
          color: var(--ui-text);
        }
        .cmdk__list {
          list-style: none;
          margin: 0;
          padding: 6px;
          max-height: 52vh;
          overflow-y: auto;
        }
        .cmdk__option {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 12px;
          border-radius: 10px;
          cursor: pointer;
          color: var(--ui-text);
        }
        .cmdk__option.is-active {
          background: var(--ui-nav-active-bg, var(--ui-surface-muted));
          color: var(--ui-nav-active-text, var(--ui-brand-700));
        }
        .cmdk__option-group {
          font-size: 12px;
          color: var(--ui-text-muted);
          white-space: nowrap;
        }
        .cmdk__empty {
          padding: 16px 12px;
          color: var(--ui-text-muted);
          text-align: center;
        }
      `}</style>
    </div>
  );
};
