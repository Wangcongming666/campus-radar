import { test, expect, type Page } from '@playwright/test';
import type { User } from '../lib/api/contracts';

// Only the BFF boundary is replaced. The actual form, adapter, CSRF handling,
// session provider, routing and React Query cache all run in the browser.
async function identityService(
  page: Page,
  options: { signedIn?: boolean; unavailable?: boolean; theme?: User['theme'] } = {},
) {
  let signedIn = options.signedIn ?? false;
  let user: User = {
    id: '11000000-0000-4000-8000-000000000001',
    displayName: '云端同学',
    emailMasked: 'st***@example.com',
    onboardingStep: 0,
    theme: options.theme ?? 'dark',
    timezone: 'Asia/Shanghai',
    graduationYear: 2027,
    education: 'bachelor',
    school: '示例大学',
    preferences: {
      schemaVersion: 1,
      roles: [],
      cities: [],
      industries: [],
      recruitmentTypes: ['campus'],
      graduationYear: 2027,
    },
    overview: { applications: 0, interviews: 0, offers: 0, favorites: 0 },
  };
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const respond = (status: number, value: unknown, csrf = false) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        headers: {
          'X-Campus-Data-Mode': 'api',
          ...(csrf ? { 'X-CSRF-Token': 'session-csrf' } : {}),
        },
        body: JSON.stringify(value),
      });
    if (options.unavailable)
      return respond(503, {
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: '身份服务暂时不可用。',
          requestId: 'request-unavailable',
        },
      });
    if (path === '/api/v1/auth/csrf')
      return respond(200, { data: { csrfToken: 'anonymous-csrf' } });
    if (request.method() !== 'GET') {
      const expected = signedIn ? 'session-csrf' : 'anonymous-csrf';
      if (request.headers()['x-csrf-token'] !== expected)
        return respond(403, {
          error: { code: 'CSRF_INVALID', message: '请求校验失败。', requestId: 'request-csrf' },
        });
    }
    if (path === '/api/v1/auth/login') {
      const body = request.postDataJSON();
      if (body.email !== 'student@example.com' || body.password !== 'sample-password-2027')
        return respond(401, {
          error: {
            code: 'INVALID_CREDENTIALS',
            message: '邮箱或密码无效。',
            requestId: 'request-login',
          },
        });
      signedIn = true;
      return respond(200, { data: user }, true);
    }
    if (path === '/api/v1/auth/register') {
      const body = request.postDataJSON();
      if (body.displayName !== '新同学' || body.password.length < 12)
        return respond(422, {
          error: {
            code: 'VALIDATION_FAILED',
            message: '资料无效。',
            requestId: 'request-register',
          },
        });
      return respond(202, { data: { verificationRequired: true } });
    }
    if (path === '/api/v1/auth/logout') {
      signedIn = false;
      return route.fulfill({ status: 204 });
    }
    if (path === '/api/v1/me') {
      if (!signedIn)
        return respond(401, {
          error: { code: 'AUTH_REQUIRED', message: '请先登录。', requestId: 'request-me' },
        });
      if (request.method() === 'PATCH') user = { ...user, ...request.postDataJSON() };
      return respond(200, { data: user }, true);
    }
    return respond(503, {
      error: { code: 'SERVICE_UNAVAILABLE', message: '此接口未配置。', requestId: 'request-other' },
    });
  });
  return {
    expire: () => {
      signedIn = false;
    },
    revise: (patch: Partial<User>) => {
      user = { ...user, ...patch };
    },
  };
}

test('API login recovers session, updates the cloud profile and signs out without demo leakage', async ({
  page,
}) => {
  await identityService(page);
  await page.goto('/me');
  await expect(page).toHaveURL(/\/login\?returnTo=/);
  await page.getByLabel('邮箱', { exact: true }).fill('student@example.com');
  await page.getByLabel('密码', { exact: true }).fill('sample-password-2027');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page).toHaveURL(/\/me$/);
  await expect(page.getByRole('heading', { name: '云端同学，你好' })).toBeVisible();
  await expect(page.getByText('林同学', { exact: true })).toHaveCount(0);
  await page.getByLabel('昵称', { exact: true }).fill('更新后的同学');
  await page.getByRole('button', { name: '保存到云端' }).click();
  await expect(page.getByRole('heading', { name: '更新后的同学，你好' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: '更新后的同学，你好' })).toBeVisible();
  const storage = await page.evaluate(() => JSON.stringify(localStorage));
  expect(storage).not.toContain('sample-password-2027');
  expect(storage).not.toContain('更新后的同学');
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await page.goto('/me');
  await expect(page).toHaveURL(/\/login\?returnTo=/);
  await expect(page.getByText('更新后的同学', { exact: true })).toHaveCount(0);
});

test('API registration shows verification instructions without claiming to be signed in', async ({
  page,
}) => {
  await identityService(page);
  await page.goto('/register');
  await page.getByLabel('昵称', { exact: true }).fill('新同学');
  await page.getByLabel('邮箱', { exact: true }).fill('student@example.com');
  await page.getByLabel('密码', { exact: true }).fill('sample-password-2027');
  await page.getByRole('button', { name: '注册', exact: true }).click();
  await expect(page.getByRole('heading', { name: '请查收验证邮件' })).toBeVisible();
  await expect(page).toHaveURL(/\/register$/);
  await page.goto('/me');
  await expect(page).toHaveURL(/\/login\?returnTo=/);
});

test('API errors stay visible and never fall back to a demo identity', async ({ page }) => {
  await identityService(page, { unavailable: true });
  await page.goto('/me');
  await expect(page.locator('main').getByRole('alert')).toContainText('身份服务暂时不可用');
  await expect(page.getByRole('button', { name: '重新连接' })).toBeVisible();
  await expect(page.getByText('林同学', { exact: true })).toHaveCount(0);
});

test('API mode keeps unconnected product modules separate from local demo content', async ({
  page,
}) => {
  await identityService(page, { signedIn: true });
  await page.goto('/pipeline');
  await expect(page.getByRole('heading', { name: '投递看板正在接入云端' })).toBeVisible();
  await expect(page.getByText('游戏客户端开发工程师', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '全局搜索', exact: true })).toHaveCount(0);
});

test('expired API session returns to login and hides the previous profile', async ({ page }) => {
  const identity = await identityService(page, { signedIn: true });
  await page.goto('/me');
  await expect(page.getByRole('heading', { name: '云端同学，你好' })).toBeVisible();
  identity.expire();
  await page.reload();
  await expect(page).toHaveURL(/\/login\?returnTo=/);
  await expect(page.getByRole('heading', { name: '云端同学，你好' })).toHaveCount(0);
});

test('invalid API credentials show a recoverable error and clear the password field', async ({
  page,
}) => {
  await identityService(page);
  await page.goto('/login?returnTo=https://evil.example');
  await page.getByLabel('邮箱', { exact: true }).fill('student@example.com');
  await page.getByLabel('密码', { exact: true }).fill('incorrect-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.locator('main').getByRole('alert')).toContainText('邮箱或密码无效');
  await expect(page.getByLabel('密码', { exact: true })).toHaveValue('');
  await page.getByLabel('密码', { exact: true }).fill('sample-password-2027');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page).toHaveURL(/\/me$/);
});

test('connected profile shares the responsive shell on mobile', async ({ page }) => {
  await identityService(page, { signedIn: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/me');
  await expect(page.getByLabel('昵称', { exact: true })).toHaveValue('云端同学');
  await expect(page.getByRole('navigation', { name: '底部导航' })).toBeVisible();
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: '../../artifacts/qa/api-account-mobile-fixture.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 1512, height: 1100 });
  await expect
    .poll(() => page.locator('main').evaluate((element) => element.getBoundingClientRect().x))
    .toBe(248);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: '../../artifacts/qa/api-account-desktop-fixture.png',
    fullPage: true,
    animations: 'disabled',
  });
});

test('session restoration applies the account theme over a previous browser preference', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
  await identityService(page, { signedIn: true, theme: 'light' });
  await page.goto('/me');
  await expect(page.getByRole('heading', { name: '云端同学，你好' })).toBeVisible();
  await expect(page.locator('html')).toHaveClass('light');
});

test('profile refresh synchronizes clean fields and protects unsaved edits from overwriting remote changes', async ({
  page,
}) => {
  const identity = await identityService(page, { signedIn: true });
  await page.goto('/me');
  await expect(page.getByLabel('昵称', { exact: true })).toHaveValue('云端同学');
  identity.revise({ displayName: '另一标签更新' });
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByRole('heading', { name: '另一标签更新，你好' })).toBeVisible();
  await expect(page.getByLabel('昵称', { exact: true })).toHaveValue('另一标签更新');
  await page.getByLabel('学校', { exact: true }).fill('尚未保存的学校');
  identity.revise({ displayName: '再次更新' });
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByRole('heading', { name: '再次更新，你好' })).toBeVisible();
  await expect(page.getByLabel('学校', { exact: true })).toHaveValue('尚未保存的学校');
  await expect(page.getByRole('button', { name: '保存到云端' })).toBeDisabled();
  await page.getByRole('button', { name: '重新载入资料' }).click();
  await expect(page.getByLabel('昵称', { exact: true })).toHaveValue('再次更新');
  await expect(page.getByLabel('学校', { exact: true })).toHaveValue('示例大学');
  await expect(page.getByRole('button', { name: '保存到云端' })).toBeEnabled();
});
