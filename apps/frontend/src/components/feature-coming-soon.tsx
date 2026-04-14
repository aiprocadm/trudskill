import Link from 'next/link';

import { SectionCard } from './state-wrappers';

type FeatureComingSoonLink = {
  href: string;
  label: string;
};

export interface FeatureComingSoonProps {
  progress: number;
  availableNow: string[];
  roles: string[];
  eta: string;
  links: FeatureComingSoonLink[];
}

export const FeatureComingSoon = ({
  progress,
  availableNow,
  roles,
  eta,
  links
}: FeatureComingSoonProps) => (
  <>
    <SectionCard title="Статус реализации">
      <p className="ui-prose-muted">Готовность: {Math.max(0, Math.min(100, progress))}%</p>
      <progress max={100} value={Math.max(0, Math.min(100, progress))} />
      <p className="ui-prose-muted">Плановый срок: {eta}</p>
    </SectionCard>
    <SectionCard title="Доступно уже сейчас">
      <ul className="ui-ordered-list">
        {availableNow.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </SectionCard>
    <SectionCard title="Роли и доступ">
      <p className="ui-prose-muted">{roles.join(', ')}</p>
    </SectionCard>
    <SectionCard title="Быстрые переходы">
      <div className="ui-stack">
        {links.map((link) => (
          <Link key={link.href} href={link.href}>
            {link.label}
          </Link>
        ))}
      </div>
    </SectionCard>
  </>
);
