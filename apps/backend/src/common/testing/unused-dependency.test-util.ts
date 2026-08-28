/**
 * Заглушка для зависимости, которая в конкретном тесте не участвует.
 *
 * Зачем она есть (журнал расхождений, запись 287). Юнит-тесты собирают сервисы и
 * контроллеры позиционно: `new DocumentsController(service)` при семи зависимостях.
 * Пока тесты не проходили проверку типов, недостающие шесть молча становились
 * `undefined`: тест зелёный, а первое же обращение к такой зависимости падает —
 * и падает не в тесте, а в асинхронном хвосте, где виновника уже не назвать.
 *
 * `unusedDependency` делает пропуск ГРОМКИМ: любое обращение к полю бросает с именем
 * зависимости и подсказкой, что тест пора достроить. Тип — настоящий, поэтому
 * проверка типов видит, что аргумент на месте.
 *
 * Пример:
 *   new DocumentsController(
 *     service,
 *     unusedDependency<DocumentsEnqueueService>('DocumentsEnqueueService'),
 *     ...
 *   );
 */
export function unusedDependency<T extends object>(name: string): T {
  return new Proxy(
    {},
    {
      get(_target, property) {
        // Vitest/Node щупают эти поля при печати значения — на них бросать нельзя,
        // иначе диагностика самого теста превращается в кашу.
        if (typeof property === 'symbol' || property === 'then' || property === 'constructor') {
          return undefined;
        }
        throw new Error(
          `Зависимость ${name} не подставлена в этом тесте, но её метод «${String(property)}» ` +
            'вызвали. Достройте тест настоящей заглушкой вместо unusedDependency.'
        );
      }
    }
  ) as T;
}
