import { isValidElement } from 'react';

import type { ReactElement } from 'react';

/**
 * Чтение свойств элемента в тестах пакета (журнал расхождений, запись 296).
 *
 * Тесты компонентов зовут их как функции и ходят по дереву результата: `bar.props.children`.
 * В типах React 19 свойства элемента объявлены как `unknown` — обратиться к ним напрямую
 * нельзя. Пока тесты не проходили проверку типов, этого никто не видел; включение проверки
 * дало 239 ошибок, почти все — про этот один узор.
 *
 * `propsOf` принимает что угодно и требует, чтобы это оказалось элементом. Так проверка
 * остаётся честной: если по дереву прошли мимо (элемента нет, вместо него строка или
 * `undefined`), тест падает СРАЗУ и с внятным текстом, а не «cannot read properties of
 * undefined» тремя строками ниже.
 */
export function propsOf(node: unknown): Record<string, unknown> {
  if (!isValidElement(node)) {
    throw new Error(
      `Ожидался элемент React, а пришло: ${node === undefined ? 'undefined' : JSON.stringify(node)}`
    );
  }
  return node.props as Record<string, unknown>;
}

/** Дети элемента списком — одиночный ребёнок тоже приводится к списку из одного. */
export function childrenOf(node: unknown): ReactElement[] {
  const children = propsOf(node).children;
  if (children === undefined || children === null) return [];
  return (Array.isArray(children) ? children : [children]) as ReactElement[];
}

/**
 * Обработчик события со свойств элемента. Тесты вызывают его напрямую (RTL в пакете нет),
 * а `unknown` вызвать нельзя — здесь же проверяется, что обработчик вообще функция.
 */
export function handlerOf(node: unknown, name: string): (...args: unknown[]) => unknown {
  const handler = propsOf(node)[name];
  if (typeof handler !== 'function') {
    throw new Error(`У элемента нет обработчика «${name}» (пришло: ${typeof handler})`);
  }
  return handler as (...args: unknown[]) => unknown;
}

/** Инлайновые стили элемента словарём. */
export function styleOf(node: unknown): Record<string, unknown> {
  const style = propsOf(node).style;
  if (style === undefined || style === null) return {};
  return style as Record<string, unknown>;
}

/** Текст элемента: дети-строки и числа, склеенные подряд. */
export function textOf(node: unknown): string {
  return childrenOf(node)
    .map((child) => (typeof child === 'object' ? '' : String(child)))
    .join('');
}
