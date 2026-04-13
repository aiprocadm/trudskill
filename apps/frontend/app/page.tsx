import Link from 'next/link';

import { PageContainer, PageHeader, SectionCard } from '../src/components/state-wrappers';
import { ProtectedPage } from '../src/widgets/shell/protected-page';

const quickLinks: { href: string; title: string; note: string }[] = [
  {
    href: '/academy',
    title: 'Учебный центр',
    note: 'Реквизиты, комиссия, связь с документами (ТЗ п. 5.1, 5.15)'
  },
  { href: '/directions', title: 'Направления и курсы', note: 'Иерархия и реестр (п. 5.4)' },
  { href: '/groups', title: 'Группы и зачисления', note: 'П. 5.9' },
  { href: '/documents', title: 'Документы и шаблоны', note: 'П. 5.12–5.13' },
  { href: '/assessment', title: 'Аттестация', note: 'Тесты, попытки, задания (п. 5.6, 5.8)' },
  { href: '/esign/applications', title: 'НЭП', note: 'П. 5.14' },
  { href: '/webinars', title: 'Вебинары', note: 'П. 5.17' },
  { href: '/gov-export', title: 'Гос. выгрузки', note: 'ФРДО, ЕИСОТ — в разработке (п. 5.22)' },
  {
    href: '/workspace',
    title: 'Operational workspace',
    note: 'Overdue / blockers / next actions (Wave 1 operational pilot)'
  }
];

export default function DashboardPage() {
  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader
          title="Платформа дистанционного обучения"
          subtitle="Сводка по разделам ТЗ; доступ к пунктам меню зависит от ролей (RBAC)"
        />
        <SectionCard title="Быстрый переход">
          <div className="ui-dashboard-grid">
            {quickLinks.map((item) => (
              <Link key={item.href} href={item.href} className="ui-dashboard-tile">
                <div className="ui-dashboard-tile-title">{item.title}</div>
                <div className="ui-dashboard-tile-note">{item.note}</div>
              </Link>
            ))}
          </div>
        </SectionCard>
        <SectionCard title="Охват ТЗ">
          <p className="ui-text-muted" style={{ margin: 0, lineHeight: 1.55 }}>
            Реализованы каркас API (MVP), IAM, мультитенантность, документы (частично),
            коммуникации, НЭП (этап сценариев), интеграции и учебный контур в объёме текущего
            спринта. Прокторинг, полный SCORM, ФРДО/ЕИСОТ, телефония и промышленные отчёты отмечены
            отдельными разделами меню со статусом «в разработке».
          </p>
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
