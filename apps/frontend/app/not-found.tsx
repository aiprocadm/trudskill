import Link from 'next/link';

export default function NotFound() {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', textAlign: 'center' }}>
      <div>
        <h1>404</h1>
        <p>Страница не найдена.</p>
        <Link href="/">Вернуться на главную</Link>
      </div>
    </main>
  );
}
