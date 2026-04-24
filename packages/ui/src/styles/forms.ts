export const formStyles = `
.ui-input,.ui-select,.ui-textarea,input,select,textarea { height: 38px; border: 1px solid var(--ui-border); border-radius: 10px; padding: 0 10px; background: var(--ui-surface); color: var(--ui-text); }
textarea,.ui-textarea { min-height: 84px; padding: 8px 10px; }
.ui-field { display: grid; gap: 6px; }
.ui-field-label { font-size: 13px; font-weight: 600; color: var(--ui-text-muted); }
.ui-field-hint { font-size: 12px; color: var(--ui-text-muted); margin: 0; }
.ui-field-error { font-size: 12px; color: var(--ui-danger-600); margin: 0; }
button,.ui-button { height: 38px; border: 1px solid var(--ui-border); border-radius: 10px; background: var(--ui-surface); padding: 0 12px; cursor: pointer; transition: background .15s ease, border-color .15s ease; color: var(--ui-text); }
button:hover,.ui-button:hover { background: var(--ui-surface-muted); }
button:disabled { opacity: 0.5; cursor: not-allowed; }
.ui-button--primary { background: var(--ui-brand-600); border-color: var(--ui-brand-600); color:#fff; }
.ui-button--primary:hover { background: var(--ui-brand-700); }
.ui-button--secondary { background: var(--ui-surface-accent); border-color: var(--ui-border); color: var(--ui-text); }
.ui-button--ghost { background: transparent; border-color: transparent; color: var(--ui-brand-700); }
.ui-button--danger { background: var(--ui-danger-600); border-color: var(--ui-danger-600); color: #fff; }
.ui-button--loading { position: relative; color: transparent; pointer-events: none; }
.ui-button--loading::after {
  content: '';
  position: absolute;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid rgba(255,255,255,0.35);
  border-top-color: #fff;
  animation: ui-spin 0.75s linear infinite;
}
`;
