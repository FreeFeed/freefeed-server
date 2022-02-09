/**
 * Sequentially (!) execute async processor for each value in values
 *
 * @param values
 * @param processor
 */
export async function forEachAsync<T>(values: T[], processor: (v: T) => Promise<any>) {
  await values.reduce(async (prev: Promise<void>, v: T) => {
    await prev;
    await processor(v);
  }, Promise.resolve());
}
