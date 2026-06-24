import { AuthPageGuard } from '../../src/features/auth/guards';
import { LoginForm } from '../../src/features/auth/login-form';
import { MagicLinkForm } from '../../src/features/auth/magic-link-form';

export default function LoginPage() {
  return (
    <AuthPageGuard>
      <main className="auth-shell">
        <div className="auth-shell__panel">
          <div className="auth-shell__brand">
            <span className="ui-wordmark">trudskill</span>
            <p className="auth-shell__tagline">Платформа дистанционного обучения</p>
          </div>
          <LoginForm />
          <div className="auth-divider">
            <span>или</span>
          </div>
          <MagicLinkForm />
        </div>
      </main>
    </AuthPageGuard>
  );
}
