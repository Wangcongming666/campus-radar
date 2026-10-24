export function persistOnboardingEntries(
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
  entries: Record<string, string>,
) {
  const previous = new Map<string, string | null>();
  const written: string[] = [];
  try {
    for (const [key, value] of Object.entries(entries)) {
      previous.set(key, storage.getItem(key));
      storage.setItem(key, value);
      written.push(key);
    }
  } catch (error) {
    for (const key of written.reverse()) {
      const old = previous.get(key);
      if (old === null || old === undefined) storage.removeItem(key);
      else storage.setItem(key, old);
    }
    throw error;
  }
}
