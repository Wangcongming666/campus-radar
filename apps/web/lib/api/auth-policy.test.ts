import { describe, expect, it } from 'vitest';
import { clearPrivateCache, privateQueryKey, safeReturnTo } from './auth-policy';
import { QueryClient } from '@tanstack/react-query';

describe('authentication navigation and cache isolation', () => {
  it('preserves local path, filters and anchors', () => {
    expect(safeReturnTo('/jobs?city=上海#results')).toBe('/jobs?city=上海#results');
  });
  it.each([
    'https://evil.example/steal',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
    '/login?returnTo=/login',
    '/register',
    '/auth/callback?code=secret',
    '/jobs\nnext',
  ])('rejects unsafe or authentication-loop destination %s', (value) => {
    expect(safeReturnTo(value)).toBe('/me');
  });
  it('keeps identities in separate private caches', () => {
    expect(privateQueryKey('user-a', 'favorites')).toEqual([
      'campus',
      'private',
      'user-a',
      'favorites',
    ]);
    expect(privateQueryKey('user-b', 'favorites')).not.toEqual(
      privateQueryKey('user-a', 'favorites'),
    );
  });
  it('cancels late private responses and removes account data without clearing public content', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['campus', 'session'], { id: 'user-a' });
    client.setQueryData(['campus', 'public', 'jobs'], ['public-job']);
    client.setQueryData(privateQueryKey('user-a', 'favorites'), ['private-job']);
    let finish!: (value: string[]) => void;
    const pending = client.fetchQuery({
      queryKey: privateQueryKey('user-a', 'applications'),
      queryFn: () =>
        new Promise<string[]>((resolve) => {
          finish = resolve;
        }),
    });
    // Observe the cancellation before awaiting the cleanup; no unhandled rejection.
    const result = pending.catch(() => 'cancelled');
    await clearPrivateCache(client);
    finish(['late-private-result']);
    expect(await result).toBe('cancelled');
    expect(client.getQueriesData({ queryKey: ['campus', 'private'] })).toEqual([]);
    expect(client.getQueryData(['campus', 'session'])).toEqual({ id: 'user-a' });
    expect(client.getQueryData(['campus', 'public', 'jobs'])).toEqual(['public-job']);
    client.clear();
  });
});
