import { PageContainer, PageHeader, SectionCard } from '../../src/components/state-wrappers';
import { TzLinks } from '../../src/components/tz/tz-links';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

export default function GovExportPage() {
  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader title="Выгрузки ФИС ФРДО / ЕИСОТ" subtitle="П. 5.22 ТЗ — XML, валидация, история выгрузок" />
        <SectionCard title="Статус">
          <p style={{ margin: '0 0 12px', color: '#52525b', lineHeight: 1.55 }}>
            Форматы обмена с госреестрами не реализованы. Интеграционный каркас и журнал синхронизаций:
          </p>
          <TzLinks items={[{ href: '/integrations', label: 'Интеграции' }, { href: '/sync-logs', label: 'Журнал sync' }, { href: '/exports', label: 'Экспорты' }]} />
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
