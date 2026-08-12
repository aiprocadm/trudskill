import { chatStyles } from './chat.js';
import { courseViewerStyles } from './course-viewer.js';
import { formStyles } from './forms.js';
import { foundationStyles } from './foundation.js';
import { layoutStyles } from './layout.js';
import { modalStyles } from './modal.js';
import { shellStyles } from './shell.js';
import { tableStyles } from './tables.js';

export const uiStyleLayers = {
  foundation: foundationStyles,
  forms: formStyles,
  tables: tableStyles,
  layout: layoutStyles,
  shell: shellStyles,
  chat: chatStyles,
  modal: modalStyles,
  courseViewer: courseViewerStyles
} as const;

export const uiGlobalStyles = Object.values(uiStyleLayers).join('\n');
