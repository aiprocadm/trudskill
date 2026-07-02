export const formStyles = `
.ui-input,.ui-select,.ui-textarea,input,select,textarea { height: 40px; border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); padding: 0 12px; background: var(--ui-surface); color: var(--ui-text); font-family: inherit; font-size: 0.95rem; transition: border-color .15s ease, box-shadow .15s ease; }
.ui-input:focus,.ui-select:focus,.ui-textarea:focus,input:focus,select:focus,textarea:focus { border-color: var(--ui-brand-600); }
textarea,.ui-textarea { min-height: 88px; padding: 9px 12px; }
.ui-field { display: grid; gap: 6px; }
.ui-field-label { font-size: 13px; font-weight: 600; color: var(--ui-text-muted); }
.ui-field-hint { font-size: 12px; color: var(--ui-text-muted); margin: 0; }
.ui-field-error { font-size: 12px; color: var(--ui-danger-600); margin: 0; }
button,.ui-button,.ui-button-primary,.ui-button-secondary,.ui-button-ghost,.ui-button-danger { height: 40px; border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); background: var(--ui-surface); padding: 0 14px; cursor: pointer; font-family: inherit; font-size: 0.93rem; font-weight: 600; transition: background .15s ease, border-color .15s ease, box-shadow .15s ease, transform .15s ease; color: var(--ui-text); }
button:hover,.ui-button:hover { background: var(--ui-surface-muted); }
button:disabled { opacity: 0.5; cursor: not-allowed; }
/* Главная кнопка-действие — коралл с тёмным текстом (AA 6.4:1; белый текст на коралле = 2.6:1, провал) */
.ui-button--primary,.ui-button-primary { background: var(--ui-accent-600); border-color: var(--ui-accent-600); color: var(--ui-on-accent); box-shadow: 0 8px 18px -10px rgba(234, 99, 38, 0.55); }
.ui-button--primary:hover,.ui-button-primary:hover { background: var(--ui-accent-700); border-color: var(--ui-accent-700); transform: translateY(-1px); }
.ui-button--secondary,.ui-button-secondary { background: var(--ui-surface-accent); border-color: var(--ui-border); color: var(--ui-text); }
.ui-button--ghost,.ui-button-ghost { background: transparent; border-color: transparent; color: var(--ui-brand-700); }
.ui-button--ghost:hover,.ui-button-ghost:hover { background: var(--ui-surface-muted); }
.ui-button--danger,.ui-button-danger { background: var(--ui-danger-600); border-color: var(--ui-danger-600); color: #fff; }
.ui-button--loading { position: relative; color: transparent; pointer-events: none; }
.ui-button--loading::after {
  content: '';
  position: absolute;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid var(--ui-border);
  border-top-color: var(--ui-text);
  animation: ui-spin 0.75s linear infinite;
}
/* Спиннер подстраивается под цвет текста кнопки: тёмный на коралле, белый на красной */
.ui-button--primary.ui-button--loading::after { border-color: rgba(15,23,42,0.25); border-top-color: var(--ui-on-accent); }
.ui-button--danger.ui-button--loading::after { border-color: rgba(255,255,255,0.35); border-top-color: #fff; }
.ui-button,.ui-button--primary,.ui-button--secondary,.ui-button--ghost,.ui-button--danger { display: inline-flex; align-items: center; justify-content: center; gap: var(--ui-space-sm); }
.ui-button__icon { display: inline-flex; }
.ui-button__icon svg { width: 16px; height: 16px; }
.ui-button--loading:disabled { opacity: 1; }
`;
