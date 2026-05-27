'use client';

import { LearnerDocumentsList } from './documents-list';
import { useMyDocuments } from './hooks';
import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionError
} from '../../components/state-wrappers';

export const LearnerDocumentsScreen = () => {
  const { data, isLoading, error } = useMyDocuments();
  const documents = data?.items ?? [];

  return (
    <PageContainer>
      <PageHeader
        title="Мои документы"
        subtitle="Удостоверения, свидетельства и протоколы, выданные по итогам обучения"
      />
      {error instanceof Error ? <SectionError message={error.message} /> : null}
      {isLoading ? (
        <SectionCard title="Загрузка…">
          <p className="ui-text-muted">Готовим список ваших документов…</p>
        </SectionCard>
      ) : (
        <LearnerDocumentsList documents={documents} />
      )}
    </PageContainer>
  );
};
