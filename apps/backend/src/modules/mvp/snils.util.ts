/**
 * Валидация СНИЛС по алгоритму ПФР — ОТДЕЛЬНЫЙ модуль без зависимостей от Nest.
 *
 * **Почему вынесено сюда.** Раньше эти функции жили в `learners-bulk-import.service.ts`,
 * который импортирует `MvpService`. Любой новый потребитель, лежащий «ниже» по графу,
 * замыкал круг: `mvp.service → потребитель → learners-bulk-import.service → mvp.service`.
 * Круг не ломает сборку и не виден типам — он проявляется как ЗАВИСАНИЕ приложения при
 * старте (Nest не может достроить модуль), и ловится только интеграционным тестом по
 * таймауту. Чистые правила обязаны лежать там, откуда их можно звать отовсюду.
 */

/** Возвращает только цифры из строки СНИЛС (формат XXX-XXX-XXX YY или XXXXXXXXXYY). */
export function normalizeSnils(input: string): string {
  return input.replace(/\D/g, '');
}

/**
 * Валидация СНИЛС по алгоритму ПФР (контрольная сумма последних 2 цифр).
 *
 * Шаги:
 *   1) первые 9 цифр умножаются на позиции 9..1 (слева направо);
 *   2) если сумма < 100 — контрольное число = сумма;
 *   3) если сумма == 100 или 101 — контрольное число = 0;
 *   4) если сумма > 101 — контрольное число = (сумма mod 101), при результате
 *      100 или 101 — контрольное число = 0.
 *
 * @param digits — нормализованные 11 цифр (см. `normalizeSnils`).
 */
export function isValidSnilsChecksum(digits: string): boolean {
  if (digits.length !== 11 || !/^\d{11}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += Number(digits[i]) * (9 - i);
  }
  let computed: number;
  if (sum < 100) {
    computed = sum;
  } else if (sum === 100 || sum === 101) {
    computed = 0;
  } else {
    const mod = sum % 101;
    computed = mod === 100 || mod === 101 ? 0 : mod;
  }
  const checksum = Number(digits.slice(9, 11));
  return computed === checksum;
}
