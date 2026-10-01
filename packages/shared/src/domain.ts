export type EntityId = string

export type RecruitmentSeasonType = 'early' | 'autumn' | 'spring' | 'supplementary'
export type JobStatus = 'draft' | 'active' | 'offline' | 'expired'
export type CompanyStatus = 'active' | 'inactive'
export type EducationLevel = '大专' | '本科' | '硕士' | '博士'
export type ApplicationStage =
  | 'pending_confirmation'
  | 'applied'
  | 'written_test'
  | 'interview'
  | 'offer'
  | 'rejected'
  | 'closed'
export type ContentDifficulty = '基础' | '进阶' | '困难'
export type AdminRole = 'super_admin' | 'content_operator'

export interface Page<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
}

export interface ListQuery {
  keyword?: string
  page: number
  pageSize: number
}

export interface RecruitmentSeason {
  id: EntityId
  name: string
  year: number
  type: RecruitmentSeasonType
  startsAt: string
  endsAt: string
  active: boolean
}

export interface Company {
  id: EntityId
  name: string
  shortName: string
  logoText: string
  industry: string
  scale: string
  ownership: string
  cities: string[]
  summary: string
  description: string
  websiteUrl: string
  careersUrl: string
  status: CompanyStatus
  featured: boolean
}

export interface Job {
  id: EntityId
  companyId: EntityId
  companyName: string
  companyLogoText: string
  seasonId: EntityId
  title: string
  category: string
  city: string[]
  education: EducationLevel[]
  majors: string[]
  salaryLabel: string
  description: string
  requirements: string[]
  applyUrl: string
  sourceLabel: string
  publishedAt: string
  updatedAt: string
  deadlineAt: string
  status: JobStatus
  featured: boolean
  favorite: boolean
}

export interface JobQuery {
  keyword?: string
  city: string[]
  category: string[]
  education: string[]
  seasonId?: string
  favorite?: boolean
  sort: 'latest' | 'deadline'
  page: number
  pageSize: number
}

export interface ContentQuery extends ListQuery {
  companyId?: EntityId
  category?: string
  stage?: string
  difficulty?: ContentDifficulty
}

export interface Article {
  id: EntityId
  title: string
  summary: string
  body: string
  category: string
  companyId?: EntityId
  companyName?: string
  tags: string[]
  readingMinutes: number
  publishedAt: string
  featured: boolean
  favorite: boolean
}

export interface Question {
  id: EntityId
  prompt: string
  referenceApproach: string
  category: string
  stage: string
  difficulty: ContentDifficulty
  companyId?: EntityId
  companyName?: string
  tags: string[]
  favorite: boolean
}

export interface ApplicationEvent {
  id: EntityId
  fromStage?: ApplicationStage
  toStage: ApplicationStage
  note?: string
  occurredAt: string
}

export interface Reminder {
  id: EntityId
  applicationId: EntityId
  title: string
  remindAt: string
  channels: Array<'in_app' | 'email'>
  status: 'scheduled' | 'sent' | 'cancelled' | 'failed'
}

export interface Application {
  id: EntityId
  userId: EntityId
  jobId: EntityId
  jobTitle: string
  companyName: string
  companyLogoText: string
  city: string[]
  deadlineAt: string
  stage: ApplicationStage
  appliedAt?: string
  note: string
  archived: boolean
  events: ApplicationEvent[]
  reminders: Reminder[]
  updatedAt: string
}

export interface ResumeProfile {
  name: string
  email: string
  phone: string
  city: string
  targetRole: string
  avatarUrl?: string
}

export interface ResumeEntry {
  id: EntityId
  title: string
  subtitle: string
  startsAt: string
  endsAt: string
  description: string
}

export interface Resume {
  id: EntityId
  userId: EntityId
  name: string
  template: 'classic' | 'modern'
  accentColor: string
  profile: ResumeProfile
  education: ResumeEntry[]
  internships: ResumeEntry[]
  projects: ResumeEntry[]
  skills: string[]
  honors: string[]
  summary: string
  updatedAt: string
  version: number
}

export interface Notification {
  id: EntityId
  title: string
  body: string
  type: 'deadline' | 'application' | 'system'
  read: boolean
  createdAt: string
  href?: string
}

export interface User {
  id: EntityId
  email: string
  nickname: string
  avatarUrl?: string
  graduationYear: number
  school: string
  education: EducationLevel
  major: string
  targetRoles: string[]
  status: 'active' | 'disabled'
  role: 'student' | AdminRole
}
