'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
  Bookmark,
  BriefcaseBusiness,
  Cloud,
  LoaderCircle,
  ShieldCheck,
  Trophy,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { useCampus } from '@/components/campus-provider';
import { SessionBoundary } from '@/components/api-workspace';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader, Panel, StatCard } from '@/components/shared';
import type { User } from '@/lib/api/contracts';
import { CampusApiError } from '@/lib/api/adapter';
import { useRadarStore } from '@/lib/store';

export function ApiAccountPage({ onboarding = false }: { onboarding?: boolean }) {
  return onboarding ? (
    <SessionBoundary>
      <AccountContent onboarding />
    </SessionBoundary>
  ) : (
    <AccountContent onboarding={false} />
  );
}

function AccountContent({ onboarding }: { onboarding: boolean }) {
  const { user } = useCampus();
  const applications = useRadarStore((state) => state.applications);
  const favorites = useRadarStore((state) => state.favorites);
  if (!user) return null;
  return (
    <div className={onboarding ? 'max-w-4xl mx-auto px-5 py-12' : undefined}>
      <PageHeader
        title={onboarding ? '先完善你的个人资料' : `${user.displayName}，你好`}
        description={
          <span className="flex gap-2 items-center">
            <Cloud className="size-3.5 text-primary" />
            已连接账号 · {user.emailMasked}
          </span>
        }
      />
      {!onboarding && (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-7">
          <StatCard label="投递记录" value={applications.length} icon={BriefcaseBusiness} />
          <StatCard label="面试进程" value={applications.filter((item) => ['INTERVIEW_1', 'INTERVIEW_2', 'HR'].includes(item.stage)).length} icon={Users} />
          <StatCard label="收获 Offer" value={applications.filter((item) => item.stage === 'OFFER').length} icon={Trophy} />
          <StatCard label="云端收藏" value={favorites.length} icon={Bookmark} />
        </div>
      )}
      <ProfileForm key={user.id} user={user} onboarding={onboarding} />
      <div className="flex items-start gap-2.5 text-xs text-muted-foreground leading-6 mt-6">
        <ShieldCheck className="size-4 text-primary shrink-0 mt-1" />
        <p>
          这里显示已保存的账号资料与统计。可前往简历版本库上传文件，在设置中导出账号备份；匹配目前采用可解释规则，未调用外部 AI。
        </p>
      </div>
    </div>
  );
}

function profileFingerprint(user: User) {
  return JSON.stringify({
    displayName: user.displayName,
    school: user.school ?? '',
    graduationYear: user.graduationYear ?? null,
    education: user.education ?? 'any',
    preferences: user.preferences,
    theme: user.theme,
  });
}

function ProfileForm({ user, onboarding }: { user: User; onboarding: boolean }) {
  const campus = useCampus();
  const router = useRouter();
  const { setTheme } = useTheme();
  const [name, setName] = useState(user.displayName);
  const [school, setSchool] = useState(user.school ?? '');
  const [year, setYear] = useState(user.graduationYear?.toString() ?? '');
  const [education, setEducation] = useState<NonNullable<User['education']>>(
    user.education ?? 'any',
  );
  const [roles, setRoles] = useState(user.preferences.roles.join('，'));
  const [cities, setCities] = useState(user.preferences.cities.join('，'));
  const [theme, changeTheme] = useState(user.theme);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [baseline, setBaseline] = useState(() => profileFingerprint(user));
  const fingerprint = profileFingerprint(user);
  const remoteChanged = baseline !== fingerprint;
  function reloadProfile(value: User) {
    setName(value.displayName);
    setSchool(value.school ?? '');
    setYear(value.graduationYear?.toString() ?? '');
    setEducation(value.education ?? 'any');
    setRoles(value.preferences.roles.join('，'));
    setCities(value.preferences.cities.join('，'));
    changeTheme(value.theme);
    setBaseline(profileFingerprint(value));
    setDirty(false);
    setError('');
    setSaved(false);
  }
  useEffect(() => {
    // Only pristine forms follow background session refreshes. A dirty draft
    // requires an explicit reload before it may overwrite newer remote fields.
    if (!dirty && remoteChanged) reloadProfile(user);
  }, [dirty, remoteChanged, fingerprint, user]);
  const inputClass = 'h-10 rounded-md border border-input bg-background px-3 text-sm w-full';
  async function save() {
    if (remoteChanged) return;
    setError('');
    setSaved(false);
    const list = (value: string) => [
      ...new Set(
        value
          .split(/[,，\n]/)
          .map((v) => v.trim())
          .filter(Boolean),
      ),
    ];
    const targetRoles = list(roles),
      targetCities = list(cities);
    if (!name.trim()) {
      setError('请填写昵称。');
      return;
    }
    if (
      [targetRoles, targetCities].some(
        (items) => items.length > 30 || items.some((v) => v.length > 64),
      )
    ) {
      setError('每类最多填写 30 项，每项不超过 64 个字符。');
      return;
    }
    try {
      const updated = await campus.updateProfile({
        displayName: name.trim(),
        school: school.trim() || null,
        graduationYear: year ? Number(year) : null,
        education,
        theme,
        preferences: {
          ...user.preferences,
          roles: targetRoles,
          cities: targetCities,
          graduationYear: year ? Number(year) : null,
        },
        ...(onboarding ? { onboardingStep: Math.max(user.onboardingStep, 1) } : {}),
      });
      reloadProfile(updated);
      setTheme(theme);
      setSaved(true);
      toast.success('个人资料已保存到云端');
      if (onboarding) router.replace('/me');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '保存失败，请重试。');
      if (failure instanceof CampusApiError && failure.requestId)
        setError(`${failure.message}（请求编号：${failure.requestId}）`);
    }
  }
  return (
    <Panel title="个人资料与求职偏好" description="用于后续岗位筛选与个人计划。">
      <form
        onChange={() => {
          setDirty(true);
          setSaved(false);
        }}
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <fieldset disabled={campus.busy} className="space-y-5">
          {dirty && remoteChanged && (
            <div
              role="alert"
              className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-xs leading-6"
            >
              <p>
                资料已在其他页面更新。你输入的内容仍保留在下方；请重新载入最新资料后再编辑保存。
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => reloadProfile(user)}
              >
                重新载入资料
              </Button>
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-5">
            <label className="grid gap-2 text-xs text-muted-foreground">
              昵称
              <Input
                required
                maxLength={40}
                autoComplete="nickname"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setSaved(false);
                }}
              />
            </label>
            <label className="grid gap-2 text-xs text-muted-foreground">
              学校
              <Input
                maxLength={120}
                value={school}
                onChange={(event) => setSchool(event.target.value)}
                placeholder="选填"
              />
            </label>
            <label className="grid gap-2 text-xs text-muted-foreground">
              毕业年份
              <Input
                type="number"
                min={2020}
                max={2100}
                step={1}
                value={year}
                onChange={(event) => setYear(event.target.value)}
                placeholder="选填，例如 2027"
              />
            </label>
            <label className="grid gap-2 text-xs text-muted-foreground">
              学历
              <select
                className={inputClass}
                value={education}
                onChange={(event) =>
                  setEducation(event.target.value as NonNullable<User['education']>)
                }
              >
                <option value="any">暂不填写</option>
                <option value="associate">专科</option>
                <option value="bachelor">本科</option>
                <option value="master">硕士</option>
                <option value="doctorate">博士</option>
              </select>
            </label>
            <label className="grid gap-2 text-xs text-muted-foreground">
              目标岗位
              <Input
                value={roles}
                onChange={(event) => setRoles(event.target.value)}
                placeholder="多个方向用逗号分隔"
              />
            </label>
            <label className="grid gap-2 text-xs text-muted-foreground">
              意向城市
              <Input
                value={cities}
                onChange={(event) => setCities(event.target.value)}
                placeholder="多个城市用逗号分隔"
              />
            </label>
            <label className="grid gap-2 text-xs text-muted-foreground">
              主题偏好
              <select
                className={inputClass}
                value={theme}
                onChange={(event) => changeTheme(event.target.value as User['theme'])}
              >
                <option value="dark">深空暗色</option>
                <option value="light">清透亮色</option>
                <option value="system">跟随系统</option>
              </select>
            </label>
          </div>
          {error && (
            <p role="alert" className="field-error break-words">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-4 border-t border-border pt-5">
            <Button disabled={campus.busy || remoteChanged} type="submit">
              {campus.busy && <LoaderCircle className="size-4 animate-spin" />}保存到云端
            </Button>
            {saved && (
              <span role="status" className="text-xs text-status-offer">
                已保存
              </span>
            )}
            {onboarding && (
              <Link className="text-xs text-muted-foreground" href="/me">
                稍后完善
              </Link>
            )}
          </div>
        </fieldset>
      </form>
    </Panel>
  );
}
