export const chatStyles = `
.ui-chat-layout { display: grid; grid-template-columns: minmax(220px, 280px) 1fr; min-height: calc(100vh - 64px); align-items: stretch; }
.ui-chat-sidebar { border-right: 1px solid var(--ui-border); padding: 12px; background: var(--ui-surface-muted); overflow: auto; }
.ui-chat-sidebar-title { margin: 0 0 10px; font-size: 1rem; }
.ui-chat-dialog-btn { display: block; width: 100%; text-align: left; margin-bottom: 6px; }
.ui-chat-main { display: grid; grid-template-rows: 1fr auto; padding: 12px; gap: 12px; min-width: 0; background: var(--ui-surface); }
.ui-chat-messages { overflow: auto; max-height: calc(100vh - 200px); }
.ui-chat-msg { margin: 0 0 8px; font-size: 14px; line-height: 1.45; }
.ui-chat-form { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
@media (max-width: 1024px) {
  .ui-chat-layout { grid-template-columns: 1fr; min-height: auto; }
  .ui-chat-sidebar { border-right: 0; border-bottom: 1px solid var(--ui-border); max-height: 40vh; }
}
`;
