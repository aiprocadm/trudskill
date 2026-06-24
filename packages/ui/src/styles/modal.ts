export const modalStyles = `
.ui-modal-root { position: fixed; inset: 0; z-index: 10050; display: grid; place-items: center; padding: 16px; }
.ui-modal-backdrop { position: absolute; inset: 0; background: rgba(15, 23, 42, 0.45); }
.ui-modal-panel { position: relative; z-index: 1; width: min(440px, 100%); max-height: min(90vh, 640px); overflow: auto; background: var(--ui-surface); color: var(--ui-text); border: 1px solid var(--ui-border); border-radius: 14px; padding: 20px; box-shadow: var(--ui-shadow-strong); display: grid; gap: 14px; }
.ui-modal-title { margin: 0; font-size: 1.15rem; }
.ui-modal-actions { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }
/* Рукописная модалка (picker и т.п.): оверлей + центрированная панель */
.ui-modal { position: fixed; inset: 0; z-index: 10050; display: grid; place-items: center; padding: 16px; background: rgba(15, 23, 42, 0.45); overflow-y: auto; }
.ui-modal-content { width: min(640px, 100%); max-height: min(90vh, 720px); overflow: auto; background: var(--ui-surface); color: var(--ui-text); border: 1px solid var(--ui-border); border-radius: 14px; padding: 20px; box-shadow: var(--ui-shadow-strong); display: grid; gap: 14px; }
.ui-modal-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.ui-modal-header h2 { margin: 0; font-size: 1.15rem; font-weight: 700; color: var(--ui-text); }
`;
