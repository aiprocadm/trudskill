import { AuthPageGuard } from '../../src/features/auth/guards';
import { LoginForm } from '../../src/features/auth/login-form';

export default function LoginPage() {
  return (
    <AuthPageGuard>
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <LoginForm />
      </main>
    </AuthPageGuard>
  );
}
