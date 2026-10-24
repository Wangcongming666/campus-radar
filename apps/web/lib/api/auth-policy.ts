import type { QueryClient } from '@tanstack/react-query';

/** Restrict post-login navigation to a path in this application. */
export function safeReturnTo(value: string | null, fallback = '/me'): string {
  if (
    !value ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    /[\\\u0000-\u001f\u007f]/.test(value)
  )
    return fallback;
  try {
    const target = new URL(value, 'https://campus.invalid');
    if (
      target.origin !== 'https://campus.invalid' ||
      /^\/(login|register|auth)(\/|$)/.test(target.pathname)
    )
      return fallback;
    return value;
  } catch {
    return fallback;
  }
}

export function privateQueryKey(userId: string, ...parts: string[]) {
  return ['campus', 'private', userId, ...parts] as const;
}
/** Cancel first so a late response cannot repopulate a signed-out account's cache. */
export async function clearPrivateCache(client: QueryClient, userId?: string) {
  const queryKey = userId ? ['campus', 'private', userId] : ['campus', 'private'];
  await client.cancelQueries({ queryKey });
  client.removeQueries({ queryKey });
}
