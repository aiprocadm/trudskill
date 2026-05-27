import { describe, expect, it } from 'vitest';

import { CourseViewerScreen } from './course-viewer-screen';

describe('CourseViewerScreen', () => {
  it('экспортируется как функциональный компонент', () => {
    expect(typeof CourseViewerScreen).toBe('function');
  });
});
