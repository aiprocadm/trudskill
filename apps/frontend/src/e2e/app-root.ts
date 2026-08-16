import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Корень приложения (`apps/frontend`), посчитанный ОТ ФАЙЛА, а не от текущего каталога.
 *
 * Зачем: у набора два штатных способа запуска с разным текущим каталогом —
 * `pnpm test:frontend` из корня репозитория и `pnpm --filter @trudskill/frontend exec vitest`
 * из `apps/frontend`. Сторожа, сканирующие исходники по относительному пути `src/features`,
 * при первом способе либо падали на несуществующем каталоге, либо (что хуже) обходили ВЕСЬ
 * монорепозиторий и ловили чужие файлы. То есть проверка зависела от способа запуска.
 *
 * Та же грабля описана в CLAUDE.md для бэкенда: пути в тестах считать от `__dirname`.
 */
export const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Путь внутри приложения: `fromApp('src', 'features')`. */
export const fromApp = (...parts: string[]): string => join(APP_ROOT, ...parts);
