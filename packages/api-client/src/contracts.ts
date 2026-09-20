import type {
  AdminRole,
  Application,
  ApplicationStage,
  Article,
  Company,
  ContentQuery,
  Job,
  JobQuery,
  ListQuery,
  Notification,
  Page,
  Question,
  RecruitmentSeason,
  Resume,
  User,
} from '@career-launch/shared'

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly fieldErrors: Record<string, string> = {},
    public readonly traceId = crypto.randomUUID(),
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export interface DashboardStats {
  companies: number
  activeJobs: number
  expiringJobs: number
  publishedArticles: number
}

export interface AdminRepository {
  dashboard(): Promise<DashboardStats>
  companies: {
    list(query: ListQuery): Promise<Page<Company>>
    save(company: Company): Promise<Company>
    updateStatus(id: string, status: Company['status']): Promise<void>
  }
  jobs: {
    list(query: JobQuery): Promise<Page<Job>>
    save(job: Job): Promise<Job>
    updateStatus(id: string, status: Job['status']): Promise<void>
  }
  seasons: {
    list(): Promise<RecruitmentSeason[]>
    save(season: RecruitmentSeason): Promise<RecruitmentSeason>
  }
  articles: {
    list(query: ContentQuery): Promise<Page<Article>>
    save(article: Article): Promise<Article>
  }
  questions: {
    list(query: ContentQuery): Promise<Page<Question>>
    save(question: Question): Promise<Question>
  }
  users: {
    list(query: ListQuery): Promise<Page<User>>
    updateStatus(id: string, status: User['status']): Promise<void>
  }
  operators: {
    list(): Promise<User[]>
    save(operator: User & { role: AdminRole }): Promise<User>
  }
}

export interface CareerRepository {
  auth: {
    requestCode(email: string): Promise<{ expiresIn: number }>
    verifyCode(email: string, code: string): Promise<User>
    currentUser(): Promise<User | null>
    logout(): Promise<void>
  }
  jobs: {
    list(query: JobQuery): Promise<Page<Job>>
    get(id: string): Promise<Job>
    favorite(id: string, value: boolean): Promise<void>
  }
  companies: {
    list(query: ListQuery): Promise<Page<Company>>
    get(id: string): Promise<Company>
  }
  knowledge: {
    listArticles(query: ContentQuery): Promise<Page<Article>>
    getArticle(id: string): Promise<Article>
    listQuestions(query: ContentQuery): Promise<Page<Question>>
  }
  applications: {
    list(): Promise<Application[]>
    start(jobId: string): Promise<Application>
    updateStage(id: string, stage: ApplicationStage, note?: string): Promise<Application>
  }
  resumes: {
    list(): Promise<Resume[]>
    get(id: string): Promise<Resume>
    save(value: Resume): Promise<Resume>
    remove(id: string): Promise<void>
  }
  notifications: {
    list(): Promise<Notification[]>
    markRead(id: string): Promise<void>
    markAllRead(): Promise<void>
  }
  admin: AdminRepository
  reset(): Promise<void>
}
