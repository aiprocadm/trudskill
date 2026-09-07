'use client';

import { ListPage, PreviewNotice } from '@trudskill/ui';

import { PageContainer, PageHeader, SectionCard } from '../../src/components/state-wrappers';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

type SystemFormTemplate = {
  id: string;
  name: string;
  target: 'learner' | 'group' | 'counterparty';
  status: 'draft' | 'active';
};

/*
 * §5.433: «Компания». Одна и та же сущность (`crm.counterparties`) называлась ТРЕМЯ словами:
 * «Компании» в меню, «Заказчик» в колонке сделок, «Контрагент» в фильтре и здесь. Канон
 * задан решением владельца от 14.08.2026 (IA-017): раздел называется «Компании».
 */
const TARGET_LABELS: Record<SystemFormTemplate['target'], string> = {
  learner: 'Слушатель',
  group: 'Группа',
  counterparty: 'Компания'
};
const STATUS_LABELS: Record<SystemFormTemplate['status'], string> = {
  draft: 'Черновик',
  active: 'Активный'
};

export default function ModulePage() {
  /* Пока серверной части нет, список всегда пуст — но экран показывает, чем он станет. */
  const rows: SystemFormTemplate[] = [];

  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader
          title="Системные формы"
          subtitle="Анкеты, которые заполняют слушатели и заказчики обучения"
        />
        {/*
          Форма добавления убрана намеренно (срез 44). Она складывала шаблон в память
          страницы: человек заполнял поля, видел строку в таблице и уходил, считая работу
          сделанной, — а при следующем открытии не находил ничего. Ввод, который заведомо
          пропадёт, хуже отсутствующего ввода. Вернётся вместе с серверной частью.
        */}
        <PreviewNotice
          what="Шаблоны системных форм"
          instead="Анкеты для слушателей пока собираются в разделе «Документы» через шаблоны документов."
        />
        <SectionCard title="Реестр форм">
          {/*
            GOAL-4: каркас списка — из дизайн-системы.

            ⚠️ Раздел пока ничего не сохраняет: серверной части у системных форм нет
            (`grep` по бэкенду не находит ни ручки, ни таблицы), список живёт в памяти
            страницы и исчезает при перезагрузке. Экран, который выглядит рабочим и молча
            теряет введённое, — обман; поэтому пустое состояние говорит об этом прямо.
            Записано в журнал расхождений (запись 197).
          */}
          <ListPage<SystemFormTemplate>
            isLoading={false}
            rows={rows}
            rowKey={(row) => row.id}
            emptyMessage="Шаблоны форм ещё не добавлены"
            emptyHint="Форма — анкета, которую заполняет слушатель или заказчик. Раздел готовится: добавленные здесь шаблоны пока не сохраняются на сервере и пропадут при перезагрузке страницы."
            columns={[
              { key: 'name', title: 'Название' },
              { key: 'target', title: 'Назначение', render: (row) => TARGET_LABELS[row.target] },
              { key: 'status', title: 'Статус', render: (row) => STATUS_LABELS[row.status] }
            ]}
          />
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
