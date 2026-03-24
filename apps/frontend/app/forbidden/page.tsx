import Link from 'next/link';

export default function ForbiddenPage() {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', textAlign: 'center' }}>
      <div>
        <h1>403</h1>
        <p>У вас недостаточно прав для просмотра этой страницы.</p>
        <Link href="/">Вернуться на главную</Link>
      </div>
    </main>
  );
}
