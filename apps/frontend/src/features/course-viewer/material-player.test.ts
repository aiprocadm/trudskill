import { describe, expect, it } from 'vitest';

import { ExternalLinkViewer } from './external-link-viewer';
import { MaterialPlayer } from './material-player';
import { PdfViewer } from './pdf-viewer';
import { TextViewer } from './text-viewer';
import { VideoPlayer } from './video-player';

describe('material sub-players', () => {
  it('все sub-players и switcher экспортируются как функции', () => {
    expect(typeof MaterialPlayer).toBe('function');
    expect(typeof VideoPlayer).toBe('function');
    expect(typeof PdfViewer).toBe('function');
    expect(typeof TextViewer).toBe('function');
    expect(typeof ExternalLinkViewer).toBe('function');
  });
});
