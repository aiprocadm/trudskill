import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="ui-centered-page">
      <div className="ui-centered-card">
        <h1 className="ui-system-title">404</h1>
        <p className="ui-system-text">Страница не найдена.</p>
        <Link href="/" className="ui-link-primary">
          Вернуться на главную
        </Link>
      </div>
    </main>
  );
}
