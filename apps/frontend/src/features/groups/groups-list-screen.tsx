'use client';

import {
  BulkActionBar,
  DetailDrawer,
  ListPage,
  SearchInput,
  SelectField,
  StatusChip,
  statusAccessibleLabel,
  useConfirmDialog
} from '@trudskill/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionError
} from '../../components/state-wrappers';
import { buildCsv, downloadCsv } from '../../lib/export/csv';
import { hasPermission } from '../../lib/rbac/permissions';
import { useAuth } from '../auth/context';
import { closeGroupApi } from '../close-group/api';
import { useDocumentTemplates, useGroupsList } from '../mvp/hooks';

import type { CloseGroupsBulkOutcomeDto } from '../close-group/api';
import type { Group } from '../mvp/types';
import type { RowKey } from '@trudskill/ui';

const PAGE_SIZE = 20;

/*
 * TPL-001 (Фаза 4 срез 3). Было: маркированный список ссылок `<ul><li>` — ни статуса,
 * ни кода, ни действия, и пустое состояние сообщало «Нет групп» (формулировка запрещена
 * TXT-005). Стало: таблица со статусом словом, действие строки и пустой экран, который
 * объясняет, что это за раздел и что сделать первым.
 *
 * Выделение строк (CMP-001) включено 08.09.2026, когда появилась серверная ручка массового
 * закрытия (вопрос №13). До неё чекбоксы стояли выключенными намеренно: галочки, за которыми
 * нет операции, — обман интерфейса.
 *
 * Бланки протокола и удостоверения выбираются ОДИН раз на всю пачку: в этом и смысл
 * массового закрытия. Курс не спрашивается — сервер берёт его у самой группы, а группу с
 * двумя курсами возвращает строкой отчёта, потому что выбрать за человека, какой из курсов
 * закрывать, нельзя.
 */
export const GroupsPageScreen = () => {
  const { session } = useAuth();
  const router = useRouter();
  const canCreateGroup = hasPermission(session?.permissions ?? [], 'groups.write');
  /* Пачка выпускает документы И строит выгрузку в реестр — нужны оба права, как у ручки. */
  const canCloseGroups =
    hasPermission(session?.permissions ?? [], 'documents.generate') &&
    hasPermission(session?.permissions ?? [], 'regulatory.export.write');
  const [page, setPage] = useState(1);
  /*
   * ТЗ 5.6 (Э6): у реестра групп не было ни поиска, ни фильтров — при сотне групп
   * единственным способом найти нужную было листать страницы. Ручка `GET /groups` умела
   * и поиск (`q`), и отбор по статусу с самого начала: механизм был построен и не подключён
   * (журнал 452).
   */
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const activeFilters = [q, status].filter(Boolean).length;
  const { data, loading, error, refetch } = useGroupsList({
    page,
    page_size: PAGE_SIZE,
    ...(q ? { q } : {}),
    ...(status ? { status } : {})
  });

  const [selected, setSelected] = useState<string[]>([]);
  const [closing, setClosing] = useState(false);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [report, setReport] = useState<CloseGroupsBulkOutcomeDto | null>(null);

  const templates = useDocumentTemplates();
  const templateOptions = (type: string) =>
    (templates.data?.items ?? []).filter((t) => t.templateType === type);
  const [protocolTemplateId, setProtocolTemplateId] = useState('');
  const [certificateTemplateId, setCertificateTemplateId] = useState('');

  const totalPages = data?.total ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  /*
   * ТЗ 5.3 (Э3): закрытие групп необратимо. Ввода названий у пачки не спрашиваем — их много,
   * а отказы всё равно покажем поимённо (частичный успех); хватает осознанного клика с числом.
   */
  const { ask, dialog } = useConfirmDialog();
  const confirmBulkClose = () =>
    ask(
      {
        title: `Закрыть группы: ${selected.length}`,
        message: `Каждой из ${selected.length} групп будут выпущены протокол и удостоверения сдавшим. После закрытия состав групп изменить будет нельзя. Отказы покажем поимённо с причиной.`,
        confirmLabel: `Закрыть ${selected.length} групп`,
        tone: 'danger'
      },
      () => void runBulkClose()
    );

  /* Выгружается то, что человек видит: выбранные строки реестра. */
  const exportSelectedGroups = () => {
    const chosen = (data?.items ?? []).filter((group) => selected.includes(group.id));
    downloadCsv(
      'gruppy',
      buildCsv(
        ['Название', 'Код', 'Статус'],
        /* Статус — тем же словом, что показывает значок на экране, а не кодом. */
        chosen.map((group) => [group.name, group.code, statusAccessibleLabel(group.status)])
      )
    );
  };

  const runBulkClose = async () => {
    setRunning(true);
    setRunError(null);
    try {
      const outcome = await closeGroupApi.closeChainBulk(session!, {
        groupIds: selected,
        protocolTemplateId,
        certificateTemplateId,
        /*
         * Ключ пачки — один на нажатие. Повтор с тем же ключом безопасен: сервер выводит
         * из него ключ каждой группы и второй комплект документов не выпускает.
         */
        idempotencyKey: `bulk-close-${Date.now()}`
      });
      setReport(outcome);
      setClosing(false);
      setSelected([]);
      refetch();
    } catch (e) {
      setRunError(e instanceof Error ? e.message : 'Не удалось закрыть группы');
    } finally {
      setRunning(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Группы"
        subtitle="Учебные группы центра: состав, назначенные курсы, закрытие с выдачей документов."
        {...(canCreateGroup
          ? { primaryAction: { label: 'Создать группу', href: '/groups/new' } }
          : {})}
      />
      <SectionCard title="Реестр групп">
        {/*
          GOAL-4 волна 4: реестр групп на общем каркасе. ТЗ 5.6 (Э6): порядок блоков списка
          считает каркас — поиск и фильтры приходят слотом, массовые действия тоже.
        */}
        <ListPage<Group>
          filters={
            <>
              <SearchInput
                value={q}
                onChange={(value) => {
                  setQ(value);
                  setPage(1);
                }}
                placeholder="Название или код группы"
              />
              <select
                className="ui-select"
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                }}
                aria-label="Статус"
              >
                <option value="">Все статусы</option>
                <option value="active">{statusAccessibleLabel('active')}</option>
                <option value="archived">{statusAccessibleLabel('archived')}</option>
              </select>
            </>
          }
          activeFilterCount={activeFilters}
          onResetFilters={() => {
            setQ('');
            setStatus('');
            setPage(1);
          }}
          isLoading={loading}
          error={error ? new Error(error) : undefined}
          rows={data?.items ?? []}
          emptyMessage="Групп пока нет"
          emptyHint="Группа объединяет слушателей одной программы: по ней назначают курсы, ведут журнал часов и выдают документы."
          {...(canCreateGroup
            ? { emptyAction: { label: 'Создать первую группу', href: '/groups/new' } }
            : {})}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          {...(canCloseGroups
            ? {
                selectable: true,
                selectedKeys: selected,
                onSelectionChange: (keys: RowKey[]) => setSelected(keys.map(String))
              }
            : {})}
          columns={[
            {
              key: 'name',
              title: 'Название',
              render: (row) => <Link href={`/groups/${row.id}`}>{row.name}</Link>
            },
            { key: 'code', title: 'Код' },
            {
              key: 'status',
              title: 'Статус',
              render: (row) => <StatusChip status={row.status} />
            }
          ]}
          rowActions={(row) => [
            {
              label: 'Открыть группу',
              primary: true,
              onSelect: () => router.push(`/groups/${row.id}`)
            }
          ]}
          {...(canCloseGroups
            ? {
                bulkBar: (
                  <BulkActionBar
                    selectedCount={selected.length}
                    isRunning={running}
                    {...(report
                      ? {
                          outcome: {
                            total: report.total,
                            succeeded: report.closed,
                            /* Отказы — поимённо и с причиной: видно, какую группу дочинить. */
                            failures: report.rows
                              .filter((row) => row.status === 'skipped')
                              .map((row) => ({
                                label: row.groupName,
                                reason: row.reason ?? 'Не удалось закрыть'
                              }))
                          }
                        }
                      : {})}
                    /*
                      ТЗ 5.5 (Э5): в панели было одно действие, и то необратимое. Выгрузка
                      выбранных — полезное; опасное компонент печатает последним и красным.
                    */
                    actions={[
                      { label: 'Выгрузить выбранные', onSelect: exportSelectedGroups },
                      {
                        label: 'Закрыть выбранные группы',
                        danger: true,
                        onSelect: () => setClosing(true)
                      }
                    ]}
                    onClear={() => {
                      setSelected([]);
                      setReport(null);
                    }}
                  />
                )
              }
            : {})}
        />

        {dialog}
      </SectionCard>

      {closing ? (
        <DetailDrawer
          open
          title={`Закрыть группы: ${selected.length}`}
          onClose={() => setClosing(false)}
        >
          <div className="ui-form">
            <p className="ui-hint">
              По каждой группе выйдет протокол и удостоверения тем, кто сдал. Кто не сдал или у кого
              не хватает данных — попадёт в отчёт поимённо, остальные документы выйдут.
            </p>
            <SelectField
              label="Бланк протокола"
              required
              value={protocolTemplateId}
              onChange={(event) => setProtocolTemplateId(event.target.value)}
              options={[
                { value: '', label: 'Выберите бланк' },
                ...templateOptions('protocol').map((t) => ({ value: t.id, label: t.name }))
              ]}
            />
            <SelectField
              label="Бланк удостоверения"
              required
              value={certificateTemplateId}
              onChange={(event) => setCertificateTemplateId(event.target.value)}
              options={[
                { value: '', label: 'Выберите бланк' },
                ...templateOptions('certificate').map((t) => ({ value: t.id, label: t.name }))
              ]}
            />
            {runError ? <SectionError message={runError} /> : null}
            <div className="ui-form-actions">
              <button type="button" className="ui-button" onClick={() => setClosing(false)}>
                Отмена
              </button>
              {/*
                Э4 (ТЗ 5.4): закрытие групп необратимо — кнопка не носит конструктивный
                оранжевый акцент, хотя панель и открыта ради него. TXT-003: подпись не
                меняется по ходу (была «Закрываем…»), занятость показывает крутилка.
              */}
              <button
                type="button"
                className={`ui-button ui-button--danger${running ? ' ui-button--loading' : ''}`}
                disabled={running || !protocolTemplateId || !certificateTemplateId}
                aria-busy={running || undefined}
                onClick={() => confirmBulkClose()}
              >
                {`Закрыть ${selected.length} групп`}
              </button>
            </div>
          </div>
        </DetailDrawer>
      ) : null}
    </PageContainer>
  );
};
