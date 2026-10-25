import type { Catalog } from '../data';
import type {
  ApiList,
  Application,
  ApplicationBoard,
  ApplicationMove,
  ApplicationPatch,
  ApplicationUndo,
  Chapter,
  ChapterProgress,
  ChapterSummary,
  Company,
  Experience,
  ExperienceCard,
  Favorite,
  Job,
  JobCard,
  LoginRequest,
  ProgressPut,
  RegisterRequest,
  SearchResults,
  StageEvent,
  Task,
  User,
  UserPatch,
} from './contracts';
export type Query = Record<string, string | number | boolean | undefined>;
export type DataMode = 'mock' | 'api';
export class CampusApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public requestId?: string,
    public fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
  }
}
export interface CampusReadAdapter {
  readonly mode: DataMode;
  jobs(query?: Query, signal?: AbortSignal): Promise<ApiList<JobCard>>;
  job(id: string, signal?: AbortSignal): Promise<Job>;
  companies(query?: Query, signal?: AbortSignal): Promise<ApiList<Company>>;
  company(id: string, signal?: AbortSignal): Promise<Company>;
  experiences(query?: Query, signal?: AbortSignal): Promise<ApiList<ExperienceCard>>;
  experience(id: string, signal?: AbortSignal): Promise<Experience>;
  chapters(query?: Query, signal?: AbortSignal): Promise<ChapterSummary[]>;
  chapter(slug: string, signal?: AbortSignal): Promise<Chapter>;
  search(query?: Query, signal?: AbortSignal): Promise<SearchResults>;
}
const segment = (value: string) => encodeURIComponent(value);
type Options = {
  method?: string;
  body?: unknown;
  query?: Query;
  signal?: AbortSignal;
  idempotencyKey?: string;
};
export class HttpAdapter implements CampusReadAdapter {
  readonly mode: DataMode;
  private csrfToken: string | undefined;
  constructor(
    private readonly options: { baseUrl?: string; fetcher?: typeof fetch; mode?: DataMode } = {},
  ) {
    this.mode = options.mode ?? 'api';
  }
  private url(path: string, query: Query = {}) {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined) params.set(k, String(v));
    });
    return (
      (this.options.baseUrl ?? '') + '/api/v1' + path + (params.size ? '?' + params.toString() : '')
    );
  }
  private async request<T>(path: string, options: Options = {}): Promise<T> {
    const method = options.method ?? 'GET',
      headers = new Headers();
    if (options.body !== undefined) headers.set('Content-Type', 'application/json');
    if (this.csrfToken && method !== 'GET') headers.set('X-CSRF-Token', this.csrfToken);
    if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey);
    const response = await (this.options.fetcher ?? fetch)(this.url(path, options.query), {
      method,
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
    const csrf = response.headers.get('X-CSRF-Token');
    if (csrf) this.csrfToken = csrf;
    if (response.status === 204) return undefined as T;
    const value = await response.json();
    if (!response.ok) {
      const error = value?.error;
      throw new CampusApiError(
        response.status,
        error?.code ?? 'INVALID_RESPONSE',
        error?.message ?? '请求失败，请稍后重试。',
        error?.requestId,
        error?.fieldErrors,
      );
    }
    if (response.headers.get('X-Campus-Data-Mode') !== this.mode)
      throw new CampusApiError(503, 'DATA_MODE_MISMATCH', '数据模式与服务配置不一致。');
    return value as T;
  }
  private async single<T>(path: string, options: Options = {}): Promise<T> {
    return (await this.request<{ data: T }>(path, options)).data;
  }
  catalog(signal?: AbortSignal) {
    return this.single<Catalog>('/catalog', { signal });
  }
  importJobs(input: unknown) {
    return this.single<{ inserted: number }>('/jobs/import', { method: 'POST', body: input });
  }
  deleteApplication(id: string, version: number) {
    return this.request<void>('/applications/' + segment(id), {
      method: 'DELETE',
      body: { version },
    });
  }
  jobs(query?: Query, signal?: AbortSignal) {
    return this.request<ApiList<JobCard>>('/jobs', { query, signal });
  }
  job(id: string, signal?: AbortSignal) {
    return this.single<Job>('/jobs/' + segment(id), { signal });
  }
  companies(query?: Query, signal?: AbortSignal) {
    return this.request<ApiList<Company>>('/companies', { query, signal });
  }
  company(id: string, signal?: AbortSignal) {
    return this.single<Company>('/companies/' + segment(id), { signal });
  }
  experiences(query?: Query, signal?: AbortSignal) {
    return this.request<ApiList<ExperienceCard>>('/experiences', { query, signal });
  }
  experience(id: string, signal?: AbortSignal) {
    return this.single<Experience>('/experiences/' + segment(id), { signal });
  }
  chapters(query?: Query, signal?: AbortSignal) {
    return this.single<ChapterSummary[]>('/handbook/chapters', { query, signal });
  }
  chapter(slug: string, signal?: AbortSignal) {
    return this.single<Chapter>('/handbook/chapters/' + segment(slug), { signal });
  }
  search(query?: Query, signal?: AbortSignal) {
    return this.single<SearchResults>('/search', { query, signal });
  }
  async prepareAnonymousAuth() {
    this.csrfToken = (await this.single<{ csrfToken: string }>('/auth/csrf')).csrfToken;
  }
  async login(input: LoginRequest) {
    await this.prepareAnonymousAuth();
    return this.single<User>('/auth/login', { method: 'POST', body: input });
  }
  async register(input: RegisterRequest) {
    await this.prepareAnonymousAuth();
    return this.single<{ verificationRequired: boolean }>('/auth/register', {
      method: 'POST',
      body: input,
    });
  }
  async logout() {
    await this.request<void>('/auth/logout', { method: 'POST' });
    this.csrfToken = undefined;
  }
  me(signal?: AbortSignal) {
    return this.single<User>('/me', { signal });
  }
  updateMe(input: UserPatch) {
    return this.single<User>('/me', { method: 'PATCH', body: input });
  }
  applications(query?: Query) {
    return this.single<ApplicationBoard>('/applications', { query });
  }
  createApplication(jobId: string, idempotencyKey: string) {
    return this.single<Application>('/applications', {
      method: 'POST',
      body: { jobId },
      idempotencyKey,
    });
  }
  application(id: string) {
    return this.single<Application>('/applications/' + segment(id));
  }
  updateApplication(id: string, input: ApplicationPatch) {
    return this.single<Application>('/applications/' + segment(id), {
      method: 'PATCH',
      body: input,
    });
  }
  moveApplication(id: string, input: ApplicationMove, idempotencyKey: string) {
    return this.single<{ application: Application; event: StageEvent }>(
      '/applications/' + segment(id) + '/move',
      { method: 'POST', body: input, idempotencyKey },
    );
  }
  undoApplication(id: string, input: ApplicationUndo, idempotencyKey: string) {
    return this.single<{ application: Application; event: StageEvent }>(
      '/applications/' + segment(id) + '/undo',
      { method: 'POST', body: input, idempotencyKey },
    );
  }
  progress(chapterId: string) {
    return this.single<ChapterProgress>('/handbook/progress/' + segment(chapterId));
  }
  updateProgress(chapterId: string, input: ProgressPut) {
    return this.single<ChapterProgress>('/handbook/progress/' + segment(chapterId), {
      method: 'PUT',
      body: input,
    });
  }
  favorites(query?: Query) {
    return this.request<ApiList<Favorite>>('/favorites', { query });
  }
  favorite(type: Favorite['targetType'], id: string) {
    return this.single<Favorite>('/favorites/' + type + '/' + segment(id), { method: 'PUT' });
  }
  unfavorite(type: Favorite['targetType'], id: string) {
    return this.request<void>('/favorites/' + type + '/' + segment(id), { method: 'DELETE' });
  }
  task(id: string) {
    return this.single<Task>('/tasks/' + segment(id));
  }
  exportData(idempotencyKey: string) {
    return this.single<Task>('/me/export', { method: 'POST', idempotencyKey });
  }
  eraseAccount(idempotencyKey: string) {
    return this.single<{ receiptId: string; acceptedAt: string; state: 'queued' }>('/me', {
      method: 'DELETE',
      body: { confirm: 'DELETE' },
      idempotencyKey,
    });
  }
}
/** Explicit mock BFF reads; private actions remain unavailable without configured services. */
export class MockAdapter extends HttpAdapter {
  constructor(options: { baseUrl?: string; fetcher?: typeof fetch } = {}) {
    super({ ...options, mode: 'mock' });
  }
}
export function createAdapter(
  mode: string = process.env.NEXT_PUBLIC_DATA_MODE ?? 'mock',
  options: { baseUrl?: string; fetcher?: typeof fetch } = {},
): HttpAdapter {
  if (mode === 'mock') return new MockAdapter(options);
  if (mode === 'api') return new HttpAdapter(options);
  throw new CampusApiError(503, 'INVALID_DATA_MODE', '未知的数据模式。');
}
