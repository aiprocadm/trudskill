import { describe, expect, it } from 'vitest';

import { uiGlobalStyles, uiStyleLayers } from './index.js';

describe('ui style layers smoke/visual coverage', () => {
  it('includes critical app shell, form, table and modal selectors', () => {
    expect(uiGlobalStyles).toContain('.ui-app-shell-main');
    expect(uiGlobalStyles).toContain('.ui-input');
    expect(uiGlobalStyles).toContain('.ui-table');
    expect(uiGlobalStyles).toContain('.ui-modal-panel');
  });

  it('keeps layer boundaries explicit and deterministic', () => {
    // UI-020/UI-021: слои оболочки и палитры добавлены Фазой 1 редизайна — CSS каркаса
    // переехал сюда из styled-jsx, где его не видели сторожа токенов и тач-зон.
    expect(Object.keys(uiStyleLayers)).toEqual([
      'foundation',
      'forms',
      'tables',
      'layout',
      'appShell',
      'commandPalette',
      'chat',
      'modal',
      'courseViewer'
    ]);
    expect(uiStyleLayers.appShell).toContain('.app-shell__nav');
    expect(uiStyleLayers.commandPalette).toContain('.cmdk__dialog');
    expect(uiStyleLayers.layout).toContain('.ui-dashboard-grid');
    expect(uiStyleLayers.chat).toContain('.ui-chat-layout');
    expect(uiStyleLayers.tables).toContain('.ui-table-wrap');
  });

  it('does not duplicate legacy login selectors after normalization', () => {
    expect(uiGlobalStyles.match(/\.ui-login-center\s*\{/g)).toHaveLength(1);
    expect(uiGlobalStyles.match(/\.ui-login-card\s*\{/g)).toHaveLength(1);
    expect(uiStyleLayers.layout).toContain('.ui-auth-center');
    expect(uiStyleLayers.layout).toContain('.ui-auth-card');
  });
});
