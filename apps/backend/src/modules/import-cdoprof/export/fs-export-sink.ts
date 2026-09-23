/**
 * Приёмник выгрузки — папка на стенде миграции.
 *
 * Файлы содержат ПДн слушателей, поэтому права нарочно узкие: папка `0700`, файлы `0600` —
 * читает только пользователь, от которого запущен скрипт. На стенде рядом живут другие службы
 * и cron автообновления; «случайно доступно всем» — ровно тот случай, который потом ищут.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { ExportSink } from './cdoprof-export.js';

export class FsExportSink implements ExportSink {
  private prepared = false;

  constructor(readonly dir: string) {}

  async write(name: string, payload: unknown): Promise<void> {
    if (!this.prepared) {
      await mkdir(this.dir, { recursive: true, mode: 0o700 });
      this.prepared = true;
    }
    await writeFile(join(this.dir, name), `${JSON.stringify(payload, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600
    });
  }
}
