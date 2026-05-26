import { VerifyPage } from '../../../src/features/verify/verify-page';

// Pillar A Plan C §5.8 — public-страница ВНЕ ProtectedPage.
// Любой пользователь может проверить документ через QR без авторизации.

export default async function PublicVerifyTokenPage({
  params
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <VerifyPage token={token} />;
}
