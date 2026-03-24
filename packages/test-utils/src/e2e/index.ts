export const waitForAsyncTask = async <T>(loader: () => Promise<T>, retries = 5): Promise<T> => {
  let last: T | undefined;
  for (let i = 0; i < retries; i += 1) {
    last = await loader();
  }

  if (last === undefined) {
    throw new Error('Task was not loaded');
  }

  return last;
};
