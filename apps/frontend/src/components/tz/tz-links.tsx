import Link from 'next/link';

export interface TzLinkItem {
  href: string;
  label: string;
  description?: string;
}

export const TzLinks = ({ items }: { items: TzLinkItem[] }) => (
  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 14 }}>
    {items.map((item) => (
      <li key={item.href}>
        <Link href={item.href} style={{ fontWeight: 600, color: 'var(--ui-text)' }}>
          {item.label}
        </Link>
        {item.description ? (
          <p
            style={{
              margin: '4px 0 0',
              color: 'var(--ui-text-muted)',
              fontSize: 14,
              lineHeight: 1.45
            }}
          >
            {item.description}
          </p>
        ) : null}
      </li>
    ))}
  </ul>
);
