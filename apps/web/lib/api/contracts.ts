// DTOs generated from the approved MVP OpenAPI schemas. No server secrets belong here.
export type Error = {
  error: { code: string; message: string; requestId: string; fieldErrors?: {} };
};
export type Page = { nextCursor: string | null; hasMore: boolean };
export type Meta = { total?: number; snapshotAt?: string; truncated?: boolean };
export type Preferences = {
  schemaVersion: 1;
  roles: string[];
  cities: string[];
  industries: string[];
  recruitmentTypes: ('campus' | 'internship')[];
  graduationYear: number | null;
};
export type User = {
  id: string;
  displayName: string;
  emailMasked: string;
  avatarUrl?: string | null;
  graduationYear?: number | null;
  education?: 'any' | 'associate' | 'bachelor' | 'master' | 'doctorate' | null;
  school?: string | null;
  onboardingStep: number;
  preferences: Preferences;
  theme: 'dark' | 'light' | 'system';
  timezone: string;
  overview: { applications: number; interviews: number; offers: number; favorites: number };
};
export type RegisterRequest = { email: string; password: string; displayName: string };
export type LoginRequest = { email: string; password: string };
export type UserPatch = {
  displayName?: string;
  graduationYear?: number | null;
  school?: string | null;
  education?: 'any' | 'associate' | 'bachelor' | 'master' | 'doctorate' | null;
  preferences?: Preferences;
  theme?: 'dark' | 'light' | 'system';
  timezone?: string;
  onboardingStep?: number;
};
export type Company = {
  id: string;
  slug: string;
  name: string;
  logoUrl?: string | null;
  industry?: string | null;
  sizeBand?: string | null;
  locations: string[];
  tags: string[];
  description: string;
  verifiedAt: string | null;
};
export type SourceSummary = { id: string; name: string; url: string; verifiedAt: string };
export type Salary = {
  schemaVersion: 1;
  currency: string;
  period: 'month' | 'year' | 'day';
  minMinor: number | null;
  maxMinor: number | null;
  months: number | null;
  negotiable: boolean;
};
export type JobCard = {
  id: string;
  title: string;
  company: Company;
  role: string;
  cities: string[];
  education: 'any' | 'associate' | 'bachelor' | 'master' | 'doctorate';
  recruitmentType: 'campus' | 'internship';
  graduationYears: number[];
  skills: string[];
  salary: Salary | null;
  deadlineAt: string | null;
  deadlinePrecision: 'exact' | 'date' | 'unknown';
  sourceTimezone: string;
  publishedAt: string;
  verifiedAt: string;
  status: 'open' | 'closed' | 'unknown';
  source: SourceSummary;
};
export type Job = {
  id: string;
  title: string;
  company: Company;
  role: string;
  cities: string[];
  education: 'any' | 'associate' | 'bachelor' | 'master' | 'doctorate';
  recruitmentType: 'campus' | 'internship';
  graduationYears: number[];
  skills: string[];
  salary: Salary | null;
  deadlineAt: string | null;
  deadlinePrecision: 'exact' | 'date' | 'unknown';
  sourceTimezone: string;
  publishedAt: string;
  verifiedAt: string;
  status: 'open' | 'closed' | 'unknown';
  source: SourceSummary;
  descriptionMd: string;
  canonicalUrl: string;
};
export type StageEvent = {
  id: string;
  fromStage:
    | 'PENDING'
    | 'APPLIED'
    | 'ASSESSMENT'
    | 'INTERVIEW_1'
    | 'INTERVIEW_2'
    | 'HR'
    | 'OFFER'
    | 'CLOSED'
    | null;
  toStage:
    | 'PENDING'
    | 'APPLIED'
    | 'ASSESSMENT'
    | 'INTERVIEW_1'
    | 'INTERVIEW_2'
    | 'HR'
    | 'OFFER'
    | 'CLOSED';
  occurredAt: string;
  operationId: string;
  version: number;
};
export type ApplicationCard = {
  id: string;
  job: JobCard;
  stage:
    | 'PENDING'
    | 'APPLIED'
    | 'ASSESSMENT'
    | 'INTERVIEW_1'
    | 'INTERVIEW_2'
    | 'HR'
    | 'OFFER'
    | 'CLOSED';
  sortKey: string;
  version: number;
  notes: string;
  appliedAt: string | null;
  closedAt: string | null;
  closedReason: 'rejected' | 'withdrawn' | 'expired' | 'accepted' | 'other' | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
export type Application = {
  id: string;
  job: JobCard;
  stage:
    | 'PENDING'
    | 'APPLIED'
    | 'ASSESSMENT'
    | 'INTERVIEW_1'
    | 'INTERVIEW_2'
    | 'HR'
    | 'OFFER'
    | 'CLOSED';
  sortKey: string;
  version: number;
  notes: string;
  appliedAt: string | null;
  closedAt: string | null;
  closedReason: 'rejected' | 'withdrawn' | 'expired' | 'accepted' | 'other' | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  stageHistory: StageEvent[];
};
export type ApplicationCreate = { jobId: string };
export type ApplicationPatch = {
  notes?: string;
  appliedAt?: string | null;
  archived?: boolean;
  version: number;
};
export type ApplicationMove = {
  stage:
    | 'PENDING'
    | 'APPLIED'
    | 'ASSESSMENT'
    | 'INTERVIEW_1'
    | 'INTERVIEW_2'
    | 'HR'
    | 'OFFER'
    | 'CLOSED';
  beforeId?: string | null;
  afterId?: string | null;
  version: number;
  closedReason?: 'rejected' | 'withdrawn' | 'expired' | 'accepted' | 'other' | null;
  orderingScope?: 'stage' | 'company';
};
export type ApplicationUndo = { operationId: string; version: number };
export type ApplicationBoard = {
  items: ApplicationCard[];
  stats: { total: number; applied: number; interviewing: number; offers: number };
  columns: {
    stage:
      | 'PENDING'
      | 'APPLIED'
      | 'ASSESSMENT'
      | 'INTERVIEW_1'
      | 'INTERVIEW_2'
      | 'HR'
      | 'OFFER'
      | 'CLOSED';
    count: number;
  }[];
  truncated: boolean;
};
export type ExperienceCard = {
  id: string;
  company: Company | null;
  title: string;
  summary: string;
  role: string;
  roundType: 'assessment' | 'technical' | 'business' | 'hr' | 'final' | 'other';
  tags: string[];
  occurredAt: string | null;
  publishedAt: string;
  contentMode: 'licensed_full' | 'user_original' | 'excerpt_link';
  sourceUrl: string | null;
  licenseNote: string;
};
export type Experience = {
  id: string;
  company: Company | null;
  title: string;
  summary: string;
  role: string;
  roundType: 'assessment' | 'technical' | 'business' | 'hr' | 'final' | 'other';
  tags: string[];
  occurredAt: string | null;
  publishedAt: string;
  contentMode: 'licensed_full' | 'user_original' | 'excerpt_link';
  sourceUrl: string | null;
  licenseNote: string;
  bodyMd: string | null;
  toc: { id: string; title: string; level: number }[];
};
export type ChapterSummary = {
  id: string;
  parentId: string | null;
  slug: string;
  title: string;
  direction: string;
  sortOrder: number;
  contentVersion: number;
};
export type Chapter = {
  id: string;
  parentId: string | null;
  slug: string;
  title: string;
  direction: string;
  sortOrder: number;
  contentVersion: number;
  bodyMd: string;
};
export type ChapterProgress = {
  chapterId: string;
  completed: boolean;
  note: string;
  chapterVersion: number;
  version: number;
  updatedAt: string | null;
};
export type ProgressPut = { completed: boolean; note: string; version: number };
export type SearchHit = {
  id: string;
  type: 'job' | 'company' | 'experience' | 'handbook';
  title: string;
  subtitle: string;
  href: string;
  previewable: boolean;
};
export type SearchResults = {
  jobs: SearchHit[];
  companies: SearchHit[];
  experiences: SearchHit[];
  handbook: SearchHit[];
};
export type Favorite = {
  id: string;
  targetType: 'job' | 'experience' | 'company';
  targetId: string;
  createdAt: string;
  target: SearchHit | null;
  unavailable: boolean;
};
export type Task = {
  id: string;
  type: 'CRAWL_JOBS' | 'DATA_EXPORT' | 'USER_ERASURE';
  state: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  progress: number;
  attempt: number;
  createdAt: string;
  updatedAt: string;
  result: { downloadUrl: string; expiresAt: string } | null;
  errorCode: string | null;
};
export type EraseRequest = { confirm: 'DELETE' };
export type EraseReceipt = { receiptId: string; acceptedAt: string; state: 'queued' };
export type CrawlJob = {
  externalId: string | null;
  companyId: string;
  canonicalUrl: string;
  title: string;
  role: string;
  cities: string[];
  education: 'any' | 'associate' | 'bachelor' | 'master' | 'doctorate';
  recruitmentType: 'campus' | 'internship';
  graduationYears: number[];
  skills: string[];
  descriptionMd: string;
  salary: Salary | null;
  deadlineAt: string | null;
  deadlinePrecision: 'exact' | 'date' | 'unknown';
  sourceTimezone: string;
  publishedAt: string;
  observedAt: string;
  status: 'open' | 'closed' | 'unknown';
  contentHash: string;
};
export type CrawlBatch = {
  sourceId: string;
  runId: string;
  taskId: string;
  leaseToken: string;
  batchId: string;
  jobs: CrawlJob[];
  final: boolean;
};
export type CrawlBatchResult = {
  batchId: string;
  inserted: number;
  updated: number;
  unchanged: number;
  rejected: { index: number; code: string; message: string }[];
  finalized: boolean;
};
export type ApiList<T> = { data: T[]; page: Page; meta: Meta };
