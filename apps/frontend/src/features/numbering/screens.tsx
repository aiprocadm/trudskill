'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DataTable, LoadingState, useConfirmDialog } from '@trudskill/ui';
import { useState } from 'react';

import { type NumberingRuleDto, numberingApi, previewNumber, usesGroupFacts } from './api';
import { NumberingRuleDrawer, RESET_PERIODS } from './numbering-rule-drawer';
import { SectionCard, SectionEmpty, SectionError } from '../../components/state-wrappers';
import { hasPermission } from '../../lib/rbac/permissions';
import { useAuth } from '../auth/context';
import { documentKindLabel, useDocumentKinds } from '../documents/document-kinds';
import { templateTypeLabel } from '../documents/document-types';
import { readApiMessage } from '../mvp/screen-helpers';

/**
 * Следующий номер в строке: сервер знает пояс центра и освобождённые номера. Номер из данных
 * группы без группы не посчитать — тогда пример на условной группе, с пометкой.
 */
export const nextNumberView = (
  rule: Pick<
    NumberingRuleDto,
    | 'prefix'
    | 'suffix'
    | 'pattern'
    | 'resetPeriod'
    | 'series'
    | 'parts'
    | 'currentCounter'
    | 'isActive'
  >,
  server: { next: string | null } | undefined
): string => {
  if (!rule.isActive) return 'нумератор выключен';
  if (server?.next) return server.next;
  const sample = previewNumber(rule, rule.currentCounter + 1);
  return usesGroupFacts(rule.pattern) ? `по данным группы, например ${sample}` : sample;
};

/**
 * Нумераторы документов (ФТ-A4.1; МГ-F3.1 — нумерация CDOPROF, срез 19.3).
 *
 * Ключевые сценарии: УЦ переносит журнал с бумаги или из CDOPROF и продолжает нумерацию с
 * нужного номера; настраивает «номер приказа = код группы» и «номер удостоверения = номер
 * протокола + порядок»; в начале года сбрасывает счётчик. Новый нумератор — в боковой панели,
 * сброс — только администратор центра, с вводом числа уже выданных номеров.
 */
export function NumberingRulesSection() {
  const { session } = useAuth();
  /*
   * Правка нумераторов требует права записи документов, а на экран настроек пускают по
   * праву управления ролями. Без этой проверки человек видел кнопки, нажимал — и получал
   * отказ сервера; экран показывал ошибку вместо объяснения, что действие ему не положено.
   */
  const permissions = session?.permissions ?? [];
  const canEdit = hasPermission(permissions, 'documents.write');
  // Сброс — «только админ» (ТЗ МГ-F3.1): право настроек центра есть лишь у администратора.
  const canReset = canEdit && hasPermission(permissions, 'tenant.settings.write');
  const queryClient = useQueryClient();
  const { ask, dialog } = useConfirmDialog();
  const kinds = useDocumentKinds().data?.items ?? [];

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const rulesQuery = useQuery({
    queryKey: ['numbering-rules', session?.user.id],
    enabled: Boolean(session),
    queryFn: () => numberingApi.list(session!)
  });
  const rules = rulesQuery.data?.items ?? [];

  /*
   * Следующий номер — с сервера, одним запросом на все включённые нумераторы: своя обёртка
   * над react-query (`lib/query/react-query-shim.tsx`) не знает `useQueries`. Отказ по одному
   * нумератору не гасит остальные — строка покажет пример по маске.
   */
  const previewKey = rules.map((r) => `${r.id}:${r.currentCounter}:${r.isActive}`).join('|');
  const previewsQuery = useQuery({
    queryKey: ['numbering-preview', previewKey],
    enabled: Boolean(session) && rules.some((rule) => rule.isActive),
    queryFn: async () =>
      Object.fromEntries(
        await Promise.all(
          rules
            .filter((rule) => rule.isActive)
            .map(async (rule) => [
              rule.id,
              await numberingApi
                .preview(session!, {
                  documentType: rule.documentType,
                  ...(rule.kindCode ? { kindCode: rule.kindCode } : {})
                })
                .catch(() => undefined)
            ])
        )
      ) as Record<string, { next: string | null } | undefined>,
    meta: { suppressGlobalErrorToast: true }
  });

  const rows = rules.map((rule) => ({
    ...rule,
    typeTitle: templateTypeLabel(rule.documentType),
    kindTitle: rule.kindCode ? documentKindLabel(kinds, rule.kindCode) : 'все виды типа',
    resetTitle: RESET_PERIODS.find((p) => p.value === rule.resetPeriod)?.label ?? 'Без сброса',
    nextNumber: nextNumberView(rule, previewsQuery.data?.[rule.id])
  }));

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: ['numbering-rules'] });
      await queryClient.invalidateQueries({ queryKey: ['numbering-preview'] });
      setNotice(success);
    } catch (err) {
      setError(readApiMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const toggleRule = (rule: NumberingRuleDto) =>
    void run(
      () =>
        rule.isActive
          ? numberingApi.deactivate(session!, rule.id)
          : numberingApi.activate(session!, rule.id),
      rule.isActive ? 'Нумератор выключен.' : 'Нумератор включён — прежний того же вида выключен.'
    );

  /** Как нумератор называется человеку: вид документа, а без вида — тип. */
  const ruleTitle = (rule: NumberingRuleDto) =>
    rule.kindCode
      ? documentKindLabel(kinds, rule.kindCode)
      : `${templateTypeLabel(rule.documentType)}, все виды`;

  const askReset = (rule: NumberingRuleDto) =>
    ask(
      {
        title: 'Сбросить счётчик',
        tone: 'danger',
        confirmLabel: 'Сбросить счётчик',
        message:
          `Счётчик нумератора «${ruleTitle(rule)}» начнётся заново: следующий документ получит ` +
          'номер, который вы укажете. Уже выданные номера останутся в реестре; если новый номер ' +
          'совпадёт с выданным раньше, такой документ не выпустится, пока счётчик не уйдёт дальше.',
        input: { label: 'Начать с номера', placeholder: '1', required: true },
        requireTyping: {
          word: String(rule.currentCounter),
          label: `Для подтверждения введите, сколько номеров уже выдано: ${rule.currentCounter}`
        }
      },
      (value) => {
        const start = Number.parseInt(value ?? '', 10);
        if (!Number.isFinite(start) || start < 1) {
          setError('Номер, с которого начать, — целое число не меньше 1.');
          return;
        }
        void run(
          () =>
            numberingApi.reset(session!, rule.id, {
              confirmation: String(rule.currentCounter),
              startCounter: start
            }),
          `Счётчик сброшен: следующий номер начнётся с ${start}.`
        );
      }
    );

  return (
    <SectionCard
      title="Нумераторы документов"
      actions={
        canEdit ? (
          <button
            type="button"
            className="ui-button ui-button--primary"
            onClick={() => setDrawerOpen(true)}
            disabled={busy}
          >
            Новый нумератор
          </button>
        ) : undefined
      }
    >
      <p className="ui-text-muted">
        Нумератор задаёт, как выглядит номер документа и с какого числа он начинается — отдельно для
        типа документа или для конкретного вида. Работает один нумератор на тип или вид: новый
        заменяет прежний.
      </p>

      {rulesQuery.error ? <SectionError error={rulesQuery.error} /> : null}
      {error ? <SectionError message={error} /> : null}
      {notice ? <p role="status">{notice}</p> : null}
      {rulesQuery.isLoading ? <LoadingState message="Загрузка нумераторов…" /> : null}

      {!rulesQuery.isLoading && rows.length ? (
        <DataTable
          columns={[
            { key: 'typeTitle', title: 'Тип документа' },
            { key: 'kindTitle', title: 'Вид документа' },
            { key: 'pattern', title: 'Маска' },
            { key: 'resetTitle', title: 'Сброс' },
            { key: 'currentCounter', title: 'Выдано' },
            { key: 'nextNumber', title: 'Следующий номер' }
          ]}
          rows={rows}
          rowActions={(row) =>
            canEdit
              ? [
                  {
                    label: row.isActive ? 'Выключить нумератор' : 'Включить нумератор',
                    onSelect: () => toggleRule(row),
                    disabled: busy
                  },
                  ...(canReset
                    ? [
                        {
                          label: 'Сбросить счётчик',
                          onSelect: () => askReset(row),
                          danger: true,
                          disabled: busy
                        }
                      ]
                    : [])
                ]
              : []
          }
        />
      ) : null}
      {!rulesQuery.isLoading && !rows.length && !rulesQuery.error ? (
        <SectionEmpty
          message="Нумераторы не настроены"
          hint="Пока нумератора нет, номера выдаются по умолчанию: ТИП-000001. Заведите нумератор, чтобы продолжить нумерацию с бумаги или из CDOPROF."
        />
      ) : null}

      {drawerOpen ? (
        <NumberingRuleDrawer
          onClose={() => setDrawerOpen(false)}
          onSaved={(message) => {
            setDrawerOpen(false);
            setNotice(message);
            void queryClient.invalidateQueries({ queryKey: ['numbering-rules'] });
            void queryClient.invalidateQueries({ queryKey: ['numbering-preview'] });
          }}
        />
      ) : null}
      {dialog}
    </SectionCard>
  );
}
