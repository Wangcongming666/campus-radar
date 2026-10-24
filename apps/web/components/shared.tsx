'use client';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowDownRight,
  ArrowUpRight,
  ArrowRight,
  Bookmark,
  Check,
  Radio,
  Search,
  Signal,
  ChevronRight,
  BriefcaseBusiness,
  Columns3,
  BookOpen,
  FileQuestion,
  Bell,
  Files,
  Users,
  Ticket,
  CalendarDays,
} from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getCompany } from '@/lib/data';
import { cn } from '@/lib/utils';
import { AnimatedNumber } from './animated-number';
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        {description && <div className="page-description">{description}</div>}
      </div>
      {action && <div className="page-actions">{action}</div>}
    </div>
  );
}
export function Panel({
  title,
  children,
  className,
  action,
  description,
}: {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
  description?: string;
}) {
  return (
    <Card className={cn('panel shadow-none', className)}>
      {(title || action) && (
        <CardHeader className="panel-heading flex-row items-center justify-between gap-3 p-5 pb-4">
          <div>
            {title && <CardTitle className="panel-title text-sm leading-normal">{title}</CardTitle>}
            {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
          </div>
          {action}
        </CardHeader>
      )}
      <CardContent className={cn('panel-body p-5 pt-0', !title && !action && 'pt-5')}>
        {children}
      </CardContent>
    </Card>
  );
}
export function StatCard({
  label,
  value,
  change,
  icon: Icon,
  detail,
}: {
  label: string;
  value: string | number;
  change?: string;
  icon?: LucideIcon;
  detail?: string;
}) {
  return (
    <div className="stat-card">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        {Icon && <Icon className="size-4 text-subtle" />}
      </div>
      <div className="flex items-end justify-between mt-3 gap-3">
        <strong className="stat-value">
          {typeof value === 'number' ? <AnimatedNumber value={value} /> : value}
        </strong>
        {change && (
          <span className="stat-change">
            <ArrowUpRight className="size-3" />
            {change}
          </span>
        )}
      </div>
      {detail && <p className="text-xs text-muted-foreground mt-2">{detail}</p>}
    </div>
  );
}
const emptyIcons: Record<string, LucideIcon> = {
  jobs: BriefcaseBusiness,
  pipeline: Columns3,
  knowledge: BookOpen,
  questions: FileQuestion,
  favorites: Bookmark,
  notifications: Bell,
  resumes: Files,
  community: Users,
  referrals: Ticket,
  calendar: CalendarDays,
  subscriptions: Radio,
  offers: BriefcaseBusiness,
  default: Search,
};
export function EmptyState({
  kind = 'default',
  title = '暂时没有找到结果',
  description = '调整筛选条件，发现更多可能。',
  action,
}: {
  kind?: string;
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  const Icon = emptyIcons[kind] ?? Search;
  return (
    <div className="empty-state">
      <div className="empty-illustration" data-kind={kind} aria-hidden>
        <div />
        <Icon className="size-9" />
        <span />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function DemoNotice({ children }: { children?: ReactNode }) {
  return (
    <div className="demo-notice">
      <Signal className="size-3.5 shrink-0" />
      <span>
        {children ?? '当前为产品预览，岗位、匹配分及行业数据均为演示数据；操作仅保存在本机。'}
      </span>
    </div>
  );
}
export function CompanyLogo({
  companyId,
  size = 'md',
}: {
  companyId: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const company = getCompany(companyId);
  return (
    <div
      aria-label={company.name}
      className={cn(
        'company-logo',
        `logo-${company.color}`,
        size === 'sm' ? 'size-9 text-sm' : size === 'lg' ? 'size-16 text-2xl' : 'size-11 text-lg',
      )}
    >
      {company.initial}
    </div>
  );
}
export function MatchRing({ value, size = 42 }: { value: number; size?: number }) {
  const radius = 17,
    circumference = 2 * Math.PI * radius;
  return (
    <div
      className="match-ring"
      style={{ width: size, height: size }}
      aria-label={`演示匹配度 ${value}%`}
    >
      <svg viewBox="0 0 42 42">
        <circle
          cx="21"
          cy="21"
          r={radius}
          fill="none"
          stroke="currentColor"
          className="text-primary/10"
          strokeWidth="2.5"
        />
        <circle
          cx="21"
          cy="21"
          r={radius}
          fill="none"
          stroke="currentColor"
          className={value >= 90 ? 'text-primary' : 'text-status-interview'}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - value / 100)}
          transform="rotate(-90 21 21)"
        />
      </svg>
      <span>
        {value}
        <small>%</small>
      </span>
    </div>
  );
}
export function SectionLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link className="section-link" href={href}>
      {children}
      <ChevronRight className="size-3.5" />
    </Link>
  );
}
export function ProgressBar({ value, color = 'primary' }: { value: number; color?: string }) {
  return (
    <div className="progress-track">
      <div
        className={color === 'purple' ? 'progress-fill purple' : 'progress-fill'}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}
export function SmallTag({ children, active = false }: { children: ReactNode; active?: boolean }) {
  return (
    <Badge variant="secondary" className={cn('small-tag', active && 'tag-active')}>
      {children}
    </Badge>
  );
}
export function InlineStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="inline-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
export function PageTabs({
  items,
  value,
  onChange,
}: {
  items: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="page-tabs" role="tablist">
      {items.map((item, index) => (
        <button
          key={item}
          role="tab"
          aria-selected={value === item}
          tabIndex={value === item ? 0 : -1}
          onKeyDown={(event) => {
            const next =
              event.key === 'ArrowRight'
                ? (index + 1) % items.length
                : event.key === 'ArrowLeft'
                  ? (index - 1 + items.length) % items.length
                  : event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? items.length - 1
                      : null;
            if (next === null) return;
            event.preventDefault();
            onChange(items[next]);
            const buttons =
              event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                '[role="tab"]',
              );
            buttons?.[next]?.focus();
          }}
          onClick={() => onChange(item)}
          className={cn('page-tab', value === item && 'active')}
        >
          {item}
        </button>
      ))}
    </div>
  );
}
export function FavoriteButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={active ? '取消收藏' : '收藏'}
      className={cn('favorite-button', active && 'is-saved')}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <Bookmark className={cn('size-4', active && 'fill-current')} />
    </Button>
  );
}
export function CheckItem({
  children,
  checked,
  onChange,
}: {
  children: ReactNode;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button className="check-item" onClick={onChange}>
      <span className={cn('check-box', checked && 'checked')}>
        {checked && <Check className="size-3" />}
      </span>
      <span className={checked ? 'text-muted-foreground line-through' : ''}>{children}</span>
    </button>
  );
}
