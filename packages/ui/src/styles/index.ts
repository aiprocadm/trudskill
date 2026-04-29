import { chatStyles } from './chat';
import { formStyles } from './forms';
import { foundationStyles } from './foundation';
import { layoutStyles } from './layout';
import { modalStyles } from './modal';
import { tableStyles } from './tables';

export const uiStyleLayers = {
  foundation: foundationStyles,
  forms: formStyles,
  tables: tableStyles,
  layout: layoutStyles,
  chat: chatStyles,
  modal: modalStyles
} as const;

export const uiGlobalStyles = Object.values(uiStyleLayers).join('\n');
