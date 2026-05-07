#!/usr/bin/env node
/**
 * Запуск pytest с подбором интерпретатора: на Windows часто есть только `py`, без `python` в PATH.
 */
import { spawnSync } from 'node:child_process';

const extra = process.argv.slice(2);
const pytestModuleArgs = ['-m', 'pytest', ...extra];

const candidates =
  process.platform === 'win32'
    ? [
        ['py', ['-3', ...pytestModuleArgs]],
        ['python', pytestModuleArgs],
        ['python3', pytestModuleArgs]
      ]
    : [
        ['python3', pytestModuleArgs],
        ['python', pytestModuleArgs]
      ];

for (const [cmd, args] of candidates) {
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.error) {
    if (r.error.code === 'ENOENT') continue;
    throw r.error;
  }
  process.exit(r.status ?? 1);
}

console.error(
  'Не удалось найти Python (перепробованы команды для этой платформы). Установите Python 3.12+ или добавьте python в PATH.'
);
process.exit(127);
