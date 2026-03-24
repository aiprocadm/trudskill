import { EntityStatus } from '@cdoprof/shared-types';
import { DemoCard, PageContainer, Section, Stack } from '@cdoprof/ui';

import { frontendEnv } from '../src/env';

export default function HomePage() {
  return (
    <PageContainer>
      <Stack gap={16}>
        <h1 style={{ margin: 0 }}>cdoprof platform monorepo</h1>

        <Section>
          <p>API base URL: {frontendEnv.NEXT_PUBLIC_API_BASE_URL}</p>
          <p>Realtime URL: {frontendEnv.NEXT_PUBLIC_REALTIME_URL}</p>
        </Section>

        <DemoCard
          title="Frontend health route ready"
          description="Shared UI-kit, status tokens and contracts-first foundation are connected in the frontend app."
          status={EntityStatus.Active}
        />
      </Stack>
    </PageContainer>
  );
}
