import { AuthPageGuard } from '../../src/features/auth/guards';
import { LoginForm } from '../../src/features/auth/login-form';
import { MagicLinkForm } from '../../src/features/auth/magic-link-form';

export default function LoginPage() {
  return (
    <AuthPageGuard>
      <main className="ui-login-center ui-stack" style={{ gap: 24 }}>
        <LoginForm />
        <MagicLinkForm />
      </main>
    </AuthPageGuard>
  );
}
