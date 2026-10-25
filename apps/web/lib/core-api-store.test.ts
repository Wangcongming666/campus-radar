import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import type { HttpAdapter } from './api/adapter';
import type { Application } from './api/contracts';
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
const application = (): Application => ({
  id: 'a7735196-19a2-48dd-aed5-bf8266ad4c9b',
  job: {
    id: '8b546af0-dc6f-4af5-b315-b5d68bdfb332',
    title: '录入的真实岗位',
    company: {
      id: '2ff75152-b905-4e93-8556-c0d72c658fb3',
      slug: 'actual-company',
      name: '真实公司',
      locations: [],
      tags: [],
      description: '',
      verifiedAt: null,
    },
    role: 'frontend',
    cities: ['北京'],
    education: 'bachelor',
    recruitmentType: 'campus',
    graduationYears: [2027],
    skills: [],
    salary: null,
    deadlineAt: null,
    deadlinePrecision: 'unknown',
    sourceTimezone: 'Asia/Shanghai',
    publishedAt: '2026-10-24T00:00:00.000Z',
    publishedDate: '2026-10-24',
    publishedPrecision: 'exact',
    verifiedAt: null,
    status: 'unknown',
    source: {
      id: '122907cb-9fbc-467d-8549-c1bbd2602d70',
      name: '手动录入 · 官方未核验',
      url: 'https://careers.example.com/job',
      verifiedAt: null,
    },
  },
  stage: 'PENDING',
  sortKey: '1024',
  version: 1,
  notes: '',
  appliedAt: null,
  closedAt: null,
  closedReason: null,
  archivedAt: null,
  createdAt: '2026-10-24T00:00:00.000Z',
  updatedAt: '2026-10-24T00:00:00.000Z',
  stageHistory: [],
});
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_DATA_MODE', 'api');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
async function connected(fetcher: typeof fetch) {
  const { HttpAdapter } = await import('./api/adapter');
  const store = await import('./store');
  const adapter: HttpAdapter = new HttpAdapter({ fetcher });
  store.configureApiRadar(adapter, 'user-a');
  return { store, adapter };
}
const response = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { 'X-Campus-Data-Mode': 'api' } });
it('starts API mode with no demonstration catalog or private records', async () => {
  const data = await import('./data');
  expect(data.jobs).toEqual([]);
  expect(data.companies).toEqual([]);
  expect(data.experiences).toEqual([]);
  expect(data.questions).toEqual([]);
  expect(data.chapters).toEqual([]);
  expect(data.getCompany('unknown').name).toBe('公司信息未提供');
  const { useRadarStore } = await import('./store');
  expect(useRadarStore.getState().applications).toEqual([]);
  expect(useRadarStore.getState().favorites).toEqual([]);
  expect(useRadarStore.getState().completed).toEqual([]);
});
it('waits for the server before adding an application and never writes localStorage', async () => {
  let finish!: (value: Response) => void;
  const setItem = vi.fn();
  vi.stubGlobal('localStorage', { getItem: vi.fn(), setItem, removeItem: vi.fn() });
  const { store } = await connected(
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    ),
  );
  const pending = store.useRadarStore.getState().addApplication(application().job.id);
  expect(store.useRadarStore.getState().applications).toHaveLength(0);
  finish(response({ data: application() }));
  expect(await pending).toBe(true);
  expect(store.useRadarStore.getState().applications[0].jobId).toBe(application().job.id);
  expect(setItem).not.toHaveBeenCalled();
});
it('does not apply a delayed mutation result to a different account', async () => {
  let finish!: (value: Response) => void;
  const { store, adapter } = await connected(
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    ),
  );
  const pending = store.useRadarStore.getState().addApplication(application().job.id);
  store.resetApiRadar();
  store.configureApiRadar(adapter, 'user-b');
  finish(response({ data: application() }));
  expect(await pending).toBe(false);
  expect(store.useRadarStore.getState().applications).toEqual([]);
});
it('keeps confirmed notes when the private persistence bridge rejects a save', async () => {
  const { store, adapter } = await connected(vi.fn());
  store.configureApiRadar(adapter, 'user-a', {
    notes: async () => false,
    completed: async () => false,
    notifications: async () => false,
  });
  store.useRadarStore.setState({ notes: { chapter: 'confirmed' } });
  expect(await store.useRadarStore.getState().setNote('chapter', 'draft')).toBe(false);
  expect(store.useRadarStore.getState().notes.chapter).toBe('confirmed');
});
it('sends the expected version when saving application metadata', async () => {
  const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const input = JSON.parse(String(init?.body));
    expect(input).toEqual({ notes: 'server note', version: 1 });
    return response({ data: { ...application(), notes: 'server note', version: 2 } });
  });
  const { store } = await connected(fetcher);
  const a = application();
  store.useRadarStore.setState({
    applications: [
      { id: a.id, jobId: a.job.id, stage: a.stage, date: '2026-10-24', notes: '', version: 1 },
    ],
  });
  expect(
    await store.useRadarStore.getState().updateApplication(a.id, { notes: 'server note' }, 1),
  ).toBe(true);
  expect(store.useRadarStore.getState().applications[0].version).toBe(2);
});

it('accepts genuine application UUIDs before catalog hydration and rejects sample IDs in API records', async () => {
  const { applicationSchema } = await import('./workspace-schema');
  const a = application();
  const record = {
    id: a.id,
    jobId: a.job.id,
    stage: 'PENDING',
    notes: '',
    date: '2026-10-24',
    version: 1,
  };
  expect(applicationSchema.safeParse(record).success).toBe(true);
  expect(applicationSchema.safeParse({ ...record, jobId: 'job-1' }).success).toBe(false);
});
it('serializes rapid private updates against the last server-confirmed state', async () => {
  const { store, adapter } = await connected(vi.fn());
  const writes: Record<string, string>[] = [];
  store.configureApiRadar(adapter, 'user-a', {
    notes: async (value) => {
      writes.push(value);
      return true;
    },
    completed: async () => true,
    notifications: async () => true,
  });
  await Promise.all([
    store.useRadarStore.getState().setNote('first', 'a'),
    store.useRadarStore.getState().setNote('second', 'b'),
  ]);
  expect(writes).toEqual([{ first: 'a' }, { first: 'a', second: 'b' }]);
  expect(store.useRadarStore.getState().notes).toEqual({ first: 'a', second: 'b' });
});

it('waits for a real question favorite response, hydrates it from the API and cancels it', async () => {
  const question = '9b5e5196-19a2-48dd-aed5-bf8266ad4c9c';
  let saved = false;
  let finish!: (value: Response) => void;
  const favorite = {
    id: 'b7735196-19a2-48dd-aed5-bf8266ad4c9b',
    targetType: 'question',
    targetId: question,
    createdAt: '2026-10-24T00:00:00.000Z',
    target: null,
    unavailable: false,
  };
  const fetcher = vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
    const path = String(url);
    if (path.includes('/favorites/question/')) {
      if (options?.method === 'DELETE') {
        saved = false;
        return new Response(null, { status: 204 });
      }
      return new Promise<Response>((resolve) => {
        finish = resolve;
      });
    }
    if (path.includes('/applications')) return response({ data: { items: [], columns: [] } });
    return response({
      data: saved ? [favorite] : [],
      page: { nextCursor: null, hasMore: false },
      meta: {},
    });
  });
  const { store } = await connected(fetcher);
  const saving = store.useRadarStore.getState().toggleFavorite('question', question);
  expect(store.useRadarStore.getState().favorites).toEqual([]);
  saved = true;
  finish(response({ data: favorite }));
  expect(await saving).toBe(true);
  expect(store.useRadarStore.getState().favorites).toEqual(['question:' + question]);
  store.useRadarStore.setState({ favorites: [] });
  await store.hydrateApiRadar();
  expect(store.useRadarStore.getState().favorites).toEqual(['question:' + question]);
  expect(await store.useRadarStore.getState().toggleFavorite('question', question)).toBe(true);
  expect(store.useRadarStore.getState().favorites).toEqual([]);
});
