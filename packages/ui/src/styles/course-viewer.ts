export const courseViewerStyles = `
.course-viewer-layout {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 16px;
  align-items: start;
  min-height: 0;
}
.course-toc {
  display: block;
  border: 1px solid var(--ui-border);
  border-radius: 12px;
  padding: 12px;
  background: var(--ui-surface);
  max-height: calc(100vh - 160px);
  overflow: auto;
}
.course-toc__module { margin: 0 0 8px; }
.course-toc__module-summary {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-weight: 600;
  cursor: pointer;
  padding: 4px 0;
}
.course-toc__materials { list-style: none; margin: 6px 0 0; padding: 0 0 0 10px; }
.course-toc__material {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  margin: 2px 0;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  text-align: left;
  color: var(--ui-text);
}
.course-toc__material:hover:not(:disabled) { background: var(--ui-surface-muted); }
.course-toc__material--current { border-color: var(--ui-brand-600); background: var(--ui-surface-muted); }
.course-toc__material--locked { color: var(--ui-text-muted); cursor: not-allowed; }
.course-toc__material-icon { width: 18px; text-align: center; }
.course-toc__material-title { flex: 1; }
.course-player {
  display: block;
  border: 1px solid var(--ui-border);
  border-radius: 12px;
  padding: 16px;
  background: var(--ui-surface);
  min-height: 320px;
}
.course-player__placeholder {
  display: grid;
  place-items: center;
  min-height: 240px;
  color: var(--ui-text-muted);
  font-style: italic;
  text-align: center;
}
.course-player__video, .course-player__pdf { width: 100%; max-height: 70vh; border: 0; border-radius: 8px; background: #000; }
.course-player__text { font-size: 15px; line-height: 1.6; }
.course-player__external { padding: 12px; border-radius: 8px; background: var(--ui-surface-muted); }
@media (max-width: 768px) {
  .course-viewer-layout { grid-template-columns: 1fr; }
  .course-toc { max-height: none; }
}
`;
