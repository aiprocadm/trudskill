import { DemoCard } from '@cdoprof/ui';

import { frontendEnv } from '../src/env';

export default function HomePage() {
  return (
    <main style={{ margin: '2rem auto', maxWidth: 720, fontFamily: 'sans-serif' }}>
      <h1>cdoprof platform monorepo</h1>
      <p>API base URL: {frontendEnv.NEXT_PUBLIC_API_BASE_URL}</p>
      <p>Realtime URL: {frontendEnv.NEXT_PUBLIC_REALTIME_URL}</p>
      <DemoCard title="Frontend health route ready" />
    </main>
  );
}
