import { AuthPageGuard } from '../../src/features/auth/guards';
import { LoginForm } from '../../src/features/auth/login-form';

export default function LoginPage() {
  return (
    <AuthPageGuard>
      <main className="ui-login-center">
        <LoginForm />
      </main>
    </AuthPageGuard>
  );
}
