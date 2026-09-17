'use client';

import { ListPage, StatusChip } from '@trudskill/ui';

import { type TemplateDto } from './api';
import { templateTypeLabel } from './document-types';
import { hasPermission } from '../../lib/rbac/permissions';
import { useAuth } from '../auth/context';
import { formatDate } from '../mvp/screen-helpers';

import type { ReactElement } from 'react';

interface TemplateRow {
  id: string;
  name: string;
  typeView: string;
  versionView: string;
  updatedView: string;
  statusView: ReactElement;
}

/*
 * TPL-001 (Фаза 4, срез 7). Что изменилось против перенесённой версии:
 *
 * 1. Каркас реестра `ListPage` вместо таблицы плюс самодельные состояния.
 * 2. **Состояния шаблонов рисовались отдельной строкой бейджей ПОД таблицей** — кружки
 *    подряд, не привязанные ни к одной строке. Понять по ним, какой шаблон черновик, было
 *    невозможно. Теперь состояние — колонка строки.
 * 3. Вид документа словом, дата по-русски (было «Обновлен: 2026-03-12T09:15:00.000Z»).
 * 4. Действия строки: «Настроить бланк» и «Выпустить документ». Раньше шаблон выбирался
 *    в выпадающем списке ДРУГОГО блока ниже по странице, а секция настройки писала
 *    «Сначала выберите шаблон в блоке генерации».
 */
export const TemplatesSection = ({
  templates,
  isLoading,
  onSetup,
  onGenerate,
  onCreate
}: {
  templates: TemplateDto[];
  isLoading: boolean;
  onSetup: (templateId: string) => void;
  onGenerate: (templateId: string) => void;
  onCreate: () => void;
}) => {
  const { session } = useAuth();
  const canEditTemplates = hasPermission(session?.permissions ?? [], 'documents.write');
  const canGenerateDocuments = hasPermission(session?.permissions ?? [], 'documents.generate');
  const rows: TemplateRow[] = templates.map((item) => ({
    id: item.id ?? item.name,
    name: item.name,
    typeView: templateTypeLabel(item.type ?? item.templateType),
    versionView: item.currentVersion ?? 'бланк не загружен',
    updatedView: formatDate(item.updatedAt),
    statusView: <StatusChip status={item.status} />
  }));

  return (
    <ListPage<TemplateRow>
      columns={[
        { key: 'name', title: 'Шаблон' },
        { key: 'typeView', title: 'Вид документа' },
        { key: 'versionView', title: 'Версия бланка' },
        { key: 'updatedView', title: 'Изменён' },
        { key: 'statusView', title: 'Статус', render: (row) => row.statusView }
      ]}
      rows={rows}
      isLoading={isLoading}
      rowKey={(row) => row.id}
      rowActions={(row) => [
        /*
         * Настройка бланка загружает файлы, выпуск создаёт документ — оба требуют своих прав,
         * а на экран шаблонов пускают по праву ЧТЕНИЯ документов. Без проверки человек видел
         * действия, нажимал и получал отказ сервера вместо объяснения.
         */
        ...(canEditTemplates
          ? [{ label: 'Настроить бланк', onSelect: () => onSetup(row.id) }]
          : []),
        ...(canGenerateDocuments
          ? [{ label: 'Выпустить документ', onSelect: () => onGenerate(row.id) }]
          : [])
      ]}
      emptyMessage="Здесь появятся шаблоны документов"
      emptyHint="Шаблон — это бланк Word с метками вида «{ФИО}»: система подставляет в них данные слушателя и выпускает готовый документ."
      /* ТЗ 5.2: без права на бланки предложение «создать» — действие вхолостую; скрывается. */
      {...(canEditTemplates
        ? { emptyAction: { label: 'Создать первый шаблон', onSelect: onCreate } }
        : {})}
    />
  );
};
