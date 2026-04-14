import Link from 'next/link';

export default function ForbiddenPage() {
  return (
    <main className="ui-centered-page">
      <div className="ui-centered-card">
        <h1 className="ui-system-title">403</h1>
        <p className="ui-system-text">У вас недостаточно прав для просмотра этой страницы.</p>
        <Link href="/" className="ui-link-primary">
          Вернуться на главную
        </Link>
      </div>
    </main>
  );
}
