export const foundationStyles = `
[data-ui-theme] {
  background: var(--ui-bg);
  color: var(--ui-text);
  min-height: 100vh;
  font-family: var(--font-golos), 'Segoe UI', system-ui, -apple-system, Arial, sans-serif;
  font-size: 16px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}
* { box-sizing: border-box; }
.ui-page,.ui-page-container { display: grid; gap: 18px; padding: 24px clamp(16px, 3vw, 32px); }
.ui-page-header { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; }
.ui-page-title { margin:0; font-size: clamp(1.5rem, 1.2rem + 1vw, 1.85rem); font-weight: 650; letter-spacing: -0.025em; line-height: 1.2; color: var(--ui-text); }
.ui-page-subtitle { margin:6px 0 0; color: var(--ui-text-muted); font-size: 0.97rem; line-height: 1.5; }
.ui-section-card,.ui-card { background: var(--ui-surface); border: 1px solid var(--ui-border); border-radius: 16px; box-shadow: var(--ui-shadow); }
.ui-section-card { padding: 20px; display:grid; gap:14px; }
.ui-section-title { margin:0; font-size: 1.05rem; font-weight: 650; letter-spacing: -0.01em; color: var(--ui-text); display:flex; align-items:center; gap:9px; }
.ui-section-title::before { content:''; width:4px; height:1.05em; border-radius:999px; background: var(--ui-brand-600); flex:none; }
.ui-empty,.ui-error,.ui-loading { border: 1px dashed var(--ui-border); border-radius: 12px; background: var(--ui-surface-muted); padding: 16px; color: var(--ui-text-muted); }
.ui-error { border-color: var(--ui-error-border); color: var(--ui-danger-600); }
.ui-empty-hint { margin: 10px 0 0; font-size: 0.875rem; line-height: 1.5; color: var(--ui-text-muted); }
.ui-filter-bar,.ui-inline,.ui-toolbar { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
.ui-stack { display:flex; flex-direction:column; gap:12px; }
.ui-badge { color: #fff; border-radius: 999px; padding: 3px 11px; font-size: 12px; font-weight: 600; letter-spacing: 0.01em; }
.ui-badge--brand { background: var(--ui-brand-600); }
.ui-text-muted { color: var(--ui-text-muted); }
.ui-visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
.ui-prose-muted { margin: 0; color: var(--ui-text-muted); line-height: 1.6; }
.ui-prose-muted--tight { margin: 0 0 12px; }
.ui-list-row { padding: 12px 0; border-bottom: 1px solid var(--ui-border); }
.ui-list-row:last-child { border-bottom: none; }
.ui-list-row-meta { font-size: 13px; color: var(--ui-text-muted); margin-top: 4px; }
.ui-stepper { display: flex; gap: 8px; flex-wrap: wrap; margin: 0; padding: 0; list-style: none; }
.ui-step { border: 1px solid var(--ui-border); border-radius: 999px; padding: 4px 12px; font-size: 12px; color: var(--ui-text-muted); background: var(--ui-surface-muted); }
.ui-step--active { color: #fff; border-color: var(--ui-brand-600); background: var(--ui-brand-600); }
.ui-step--done { color: #fff; border-color: var(--ui-success-600); background: var(--ui-success-600); }

/* Плашки-уведомления (info/warning/success/danger) — единый тематический паттерн */
.ui-callout { border: 1px solid var(--ui-border); border-radius: 12px; padding: 12px 14px; margin: 0; display: flex; gap: 10px; align-items: flex-start; line-height: 1.5; color: var(--ui-text); background: var(--ui-surface-muted); }
.ui-callout--info { border-color: var(--ui-info-600); background: color-mix(in srgb, var(--ui-info-600) 10%, var(--ui-surface)); }
.ui-callout--warning { border-color: var(--ui-warning-600); background: color-mix(in srgb, var(--ui-warning-600) 12%, var(--ui-surface)); }
.ui-callout--success { border-color: var(--ui-success-600); background: color-mix(in srgb, var(--ui-success-600) 10%, var(--ui-surface)); }
.ui-callout--danger { border-color: var(--ui-danger-600); background: color-mix(in srgb, var(--ui-danger-600) 10%, var(--ui-surface)); }

/* Серифный вордмарк (фирменная подпись) */
.ui-wordmark { font-family: var(--font-serif), Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 1.3rem; letter-spacing: 0.01em; line-height: 1; display: inline-flex; align-items: baseline; }
.ui-wordmark__accent { color: var(--ui-hero-eyebrow); }

/* Прогресс-бары курсов — «золото зачёта» вместо дефолтного браузерного вида */
progress { -webkit-appearance: none; appearance: none; width: 100%; height: 9px; border: none; border-radius: 999px; background: var(--ui-neutral-100); overflow: hidden; }
progress::-webkit-progress-bar { background: var(--ui-neutral-100); border-radius: 999px; }
progress::-webkit-progress-value { background: linear-gradient(90deg, var(--ui-brand-700), var(--ui-brand-600)); border-radius: 999px; transition: width .4s ease; }
progress::-moz-progress-bar { background: var(--ui-brand-600); border-radius: 999px; }

/* Герой «Следующий шаг» — доминанта экрана ученика */
.ui-hero { position: relative; overflow: hidden; isolation: isolate; border-radius: 20px; padding: clamp(22px, 3vw, 32px); background: var(--ui-hero-bg); color: var(--ui-hero-text); box-shadow: var(--ui-shadow-strong); display: grid; gap: 14px; }
.ui-hero__seal { position: absolute; right: -56px; top: 50%; transform: translateY(-50%); width: 280px; height: 280px; border-radius: 50%; z-index: -1; pointer-events: none; opacity: 0.9; background: repeating-conic-gradient(from 0deg, var(--ui-hero-seal) 0deg 1.6deg, transparent 1.6deg 7deg); -webkit-mask: radial-gradient(circle, transparent 33%, #000 34%, #000 60%, transparent 62%); mask: radial-gradient(circle, transparent 33%, #000 34%, #000 60%, transparent 62%); }
.ui-hero__eyebrow { display: inline-flex; align-items: center; gap: 10px; font-size: 0.76rem; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: var(--ui-hero-eyebrow); margin: 0; }
.ui-hero__eyebrow::before { content: ''; width: 26px; height: 2px; background: var(--ui-hero-eyebrow); display: inline-block; }
.ui-hero__title { font-family: var(--font-serif), Georgia, serif; font-size: clamp(1.45rem, 1.05rem + 1.8vw, 2.05rem); line-height: 1.15; font-weight: 700; margin: 0; color: var(--ui-hero-text); letter-spacing: -0.01em; max-width: 30ch; }
.ui-hero__desc { margin: 0; color: var(--ui-hero-muted); font-size: 1rem; line-height: 1.55; max-width: 56ch; }
.ui-hero__cta { justify-self: start; display: inline-flex; align-items: center; gap: 10px; height: 48px; padding: 0 24px; border-radius: 13px; background: var(--ui-hero-cta-bg); color: var(--ui-hero-cta-text); border: none; font-family: inherit; font-weight: 700; font-size: 0.98rem; text-decoration: none; cursor: pointer; box-shadow: 0 10px 24px -12px rgba(0, 0, 0, 0.55); transition: transform .15s ease, background .15s ease, box-shadow .15s ease; }
.ui-hero__cta::after { content: '\\2192'; font-size: 1.15em; line-height: 1; transition: transform .15s ease; }
.ui-hero__cta:hover { background: var(--ui-hero-cta-bg-hover); transform: translateY(-1px); box-shadow: 0 16px 30px -12px rgba(0, 0, 0, 0.6); }
.ui-hero__cta:hover::after { transform: translateX(3px); }
.ui-hero--calm { background: var(--ui-surface); color: var(--ui-text); border: 1px solid var(--ui-border); box-shadow: var(--ui-shadow); }
.ui-hero--calm .ui-hero__eyebrow { color: var(--ui-brand-700); }
.ui-hero--calm .ui-hero__eyebrow::before { background: var(--ui-brand-600); }
.ui-hero--calm .ui-hero__title { color: var(--ui-text); }
.ui-hero--calm .ui-hero__desc { color: var(--ui-text-muted); }
.ui-hero--calm .ui-hero__seal { opacity: 0.4; }

.ui-skeleton-line {
  height: 12px;
  border-radius: 6px;
  background: linear-gradient(90deg, var(--ui-surface-muted) 25%, var(--ui-border) 50%, var(--ui-surface-muted) 75%);
  background-size: 200% 100%;
  animation: ui-skeleton-shimmer 1.2s ease-in-out infinite;
}
.ui-skeleton-block { display: grid; gap: 10px; padding: 4px 0; }
@keyframes ui-skeleton-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
@keyframes ui-spin { to { transform: rotate(360deg); } }
@keyframes ui-rise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
.ui-ordered-list { margin: 0; padding-left: 20px; color: var(--ui-text-muted); line-height: 1.7; }
.ui-code-block { margin: 0; overflow: auto; font-size: 13px; background: var(--ui-surface-muted); padding: 12px; border-radius: 10px; border: 1px solid var(--ui-border); color: var(--ui-text); }
.ui-link-primary { color: var(--ui-brand-700); font-weight: 600; text-decoration: underline; text-underline-offset: 2px; }
.ui-link-primary:hover { color: var(--ui-brand-600); }
button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,a:focus-visible { outline: 2px solid var(--ui-focus); outline-offset: 2px; border-radius: 8px; }

@media (prefers-reduced-motion: no-preference) {
  .ui-page > *,.ui-page-container > * { animation: ui-rise .5s cubic-bezier(.21,.68,.24,1) both; }
  .ui-page > *:nth-child(1),.ui-page-container > *:nth-child(1) { animation-delay: .02s; }
  .ui-page > *:nth-child(2),.ui-page-container > *:nth-child(2) { animation-delay: .08s; }
  .ui-page > *:nth-child(3),.ui-page-container > *:nth-child(3) { animation-delay: .14s; }
  .ui-page > *:nth-child(4),.ui-page-container > *:nth-child(4) { animation-delay: .20s; }
  .ui-page > *:nth-child(n+5),.ui-page-container > *:nth-child(n+5) { animation-delay: .24s; }
}

@media (max-width: 1024px) {
  .ui-page,.ui-page-container{padding:16px;}
}
@media (max-width: 768px) {
  .ui-page-header { flex-direction: column; align-items: flex-start; }
  .ui-filter-bar,.ui-inline,.ui-toolbar { align-items: stretch; }
  .ui-filter-bar > *,
  .ui-toolbar > * { width: 100%; }
  .ui-hero__cta { width: 100%; justify-content: center; }
}
`;
