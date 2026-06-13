/**
 * Phase 10 Track A — pure builder logic (validation, request serialization, base64 decode).
 * DOM-touching download is isolated in triggerDownload (not unit-tested).
 */
import type { BuildReportRequest, BuilderState, ReportFilterValue } from './types';

/** A report can run once an entity is chosen and at least one field is selected. */
export function canRun(state: BuilderState): boolean {
  return state.entityKey !== '' && state.selectedFields.length > 0;
}

/** Serialize the editing state to a request, dropping blank filter values. */
export function toRequest(state: BuilderState): BuildReportRequest {
  if (state.entityKey === '') {
    throw new Error('entity_not_selected');
  }
  const filters = state.filters.filter((f) => f.value.trim() !== '');
  return {
    entityKey: state.entityKey,
    selectedFields: state.selectedFields,
    ...(filters.length > 0 ? { filters } : {})
  };
}

/** Toggle a field key in/out of the selection, preserving order of first selection. */
export function toggleField(selected: string[], key: string): string[] {
  return selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key];
}

/** Upsert a single filter value by key (empty value keeps the row but is dropped on submit). */
export function setFilter(
  filters: ReportFilterValue[],
  key: string,
  value: string
): ReportFilterValue[] {
  const without = filters.filter((f) => f.key !== key);
  return [...without, { key, value }];
}

/** Decode a base64 string to bytes. Pure — works in both browser (atob) and Node (Buffer). */
export function base64ToBytes(base64: string): Uint8Array {
  if (typeof atob === 'function') {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

/** Browser-only: turn a base64 export into a file download. Not unit-tested (DOM side effect). */
export function triggerDownload(base64: string, mimeType: string, fileName: string): void {
  const blob = new Blob([base64ToBytes(base64) as BlobPart], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
