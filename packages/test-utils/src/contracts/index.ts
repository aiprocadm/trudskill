export const assertSuccessEnvelope = (payload: unknown): boolean => {
  if (typeof payload !== 'object' || payload === null) return false;
  return 'data' in payload && 'meta' in payload;
};

export const assertErrorEnvelope = (payload: unknown): boolean => {
  if (typeof payload !== 'object' || payload === null) return false;
  return 'error' in payload && 'meta' in payload;
};
