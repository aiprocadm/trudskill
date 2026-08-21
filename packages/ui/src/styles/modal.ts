export const modalStyles = `
/* CMP-010: боковая панель деталей. Объект смотрят и правят, не уходя со списка. */
.ui-drawer-root { position: fixed; inset: 0; z-index: 12000; }
.ui-drawer-backdrop { position: absolute; inset: 0; background: var(--ui-overlay); border: none; padding: 0; }
.ui-drawer {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  width: min(var(--ui-drawer-width, 560px), 96vw);
  background: var(--ui-surface);
  border-left: 1px solid var(--ui-border);
  box-shadow: var(--ui-shadow-strong);
}
.ui-drawer--sm { --ui-drawer-width: 420px; }
.ui-drawer--md { --ui-drawer-width: 560px; }
.ui-drawer--lg { --ui-drawer-width: 720px; }
.ui-drawer__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ui-space-md);
  padding: var(--ui-space-lg);
  border-bottom: 1px solid var(--ui-border);
  position: sticky;
  top: 0;
  background: var(--ui-surface);
}
.ui-drawer__title { margin: 0; font-size: var(--ui-font-size-lg); }
.ui-drawer__subtitle { margin: var(--ui-space-xs) 0 0; color: var(--ui-text-muted); font-size: var(--ui-font-size-sm); }
.ui-drawer__body { flex: 1 1 auto; overflow-y: auto; padding: var(--ui-space-lg); }
.ui-drawer__footer {
  padding: var(--ui-space-lg);
  border-top: 1px solid var(--ui-border);
  position: sticky;
  bottom: 0;
  background: var(--ui-surface);
}
.ui-drawer__confirm {
  position: absolute;
  inset: auto 0 0 0;
  padding: var(--ui-space-lg);
  background: var(--ui-surface);
  border-top: 1px solid var(--ui-border);
  box-shadow: var(--ui-shadow-strong);
}
.ui-drawer__confirm p { margin: 0 0 var(--ui-space-md); }
@media (max-width: 480px) {
  /* На телефоне панель разворачивается на весь экран: узкая колонка справа нечитаема. */
  .ui-drawer { width: 100vw; border-left: none; }
}

.ui-modal-root { position: fixed; inset: 0; z-index: 10050; display: grid; place-items: center; padding: 16px; }
.ui-modal-backdrop { position: absolute; inset: 0; background: var(--ui-overlay); }
.ui-modal-panel { position: relative; z-index: 1; width: min(440px, 100%); max-height: min(90vh, 640px); overflow: auto; background: var(--ui-surface); color: var(--ui-text); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); padding: 20px; box-shadow: var(--ui-shadow-strong); display: grid; gap: 14px; }
.ui-modal-title { margin: 0; font-size: var(--ui-font-size-lg); }
.ui-modal-actions { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }
/* Рукописная модалка (picker и т.п.): оверлей + центрированная панель */
.ui-modal { position: fixed; inset: 0; z-index: 10050; display: grid; place-items: center; padding: 16px; background: var(--ui-overlay); overflow-y: auto; }
.ui-modal-content { width: min(640px, 100%); max-height: min(90vh, 720px); overflow: auto; background: var(--ui-surface); color: var(--ui-text); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); padding: 20px; box-shadow: var(--ui-shadow-strong); display: grid; gap: 14px; }
.ui-modal-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.ui-modal-header h2 { margin: 0; font-size: var(--ui-font-size-lg); font-weight: var(--ui-font-weight-bold); color: var(--ui-text); }
`;
