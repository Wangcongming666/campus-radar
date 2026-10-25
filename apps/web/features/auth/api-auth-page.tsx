'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, ChevronLeft, LoaderCircle, MailCheck, Radar, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SmallTag } from '@/components/shared';
import { useCampus } from '@/components/campus-provider';
import { CampusApiError } from '@/lib/api/adapter';
import { safeReturnTo } from '@/lib/api/auth-policy';
import s from '../public/public.module.css';

export function ApiAuthPage({ register = false, brand }: { register?: boolean; brand: ReactNode }) {
  const campus = useCampus();
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [requestId, setRequestId] = useState<string>();
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const [registration, setRegistration] = useState<{ verificationRequired: boolean } | null>(null);

  async function submit() {
    setError('');
    setFields({});
    setRequestId(undefined);
    try {
      if (register) {
        const result = await campus.register({
          email: email.trim(),
          password,
          displayName: name.trim(),
        });
        setRegistration(result);
      } else {
        await campus.login({ email: email.trim(), password });
        router.replace(safeReturnTo(new URLSearchParams(window.location.search).get('returnTo')));
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '请求失败，请稍后重试。');
      if (failure instanceof CampusApiError) {
        setFields(failure.fieldErrors ?? {});
        setRequestId(failure.requestId);
      }
    } finally {
      setPassword('');
    }
  }

  return (
    <main className={s.auth}>
      <aside className={s.authStory}>
        {brand}
        <div>
          <h2>
            每一个认真准备的你，
            <br />
            都值得被看见。
          </h2>
          <p>让求职进度跟随你的账号，在每次登录时继续。</p>
          <div className={s.authGraphic}>
            <Radar size={85} strokeWidth={1} />
          </div>
        </div>
        <p className="flex items-center gap-2">
          <ShieldCheck size={15} />
          账号由安全会话保护
        </p>
      </aside>
      <div className={s.authMain}>
        <div className={s.authForm}>
          <Link
            href="/"
            className="inline-flex gap-1 items-center text-xs text-muted-foreground mb-9"
          >
            <ChevronLeft size={13} />
            返回首页
          </Link>
          <SmallTag active>Campus Radar · 个人账号</SmallTag>
          {registration ? (
            <div role="status" className="space-y-5 mt-6">
              <MailCheck className="size-10 text-primary" />
              <h1>{registration.verificationRequired ? '请查收验证邮件' : '账号已创建'}</h1>
              <p className="text-sm text-muted-foreground leading-7">
                {registration.verificationRequired
                  ? '如果该邮箱可以注册，你将收到验证邮件。请在当前浏览器打开邮件链接完成验证。未收到时也请检查垃圾邮件。'
                  : '你的账号已保存。请使用刚才的邮箱和密码登录，开始记录求职进度。'}
              </p>
              {registration.verificationRequired && (
                <p className="text-xs text-muted-foreground">
                  验证链接有时效，请勿转发；关闭当前浏览器或清除 Cookie 可能使验证失效。
                </p>
              )}
              <Button asChild className="w-full">
                <Link href="/login">返回登录</Link>
              </Button>
            </div>
          ) : (
            <>
              <h1 className="mt-4">{register ? '开启你的校招旅程' : '欢迎回来，同学'}</h1>
              <p>{register ? '创建账号，保存你的求职进度。' : '登录后继续你的校招计划。'}</p>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void submit();
                }}
              >
                <fieldset disabled={campus.busy} className="grid gap-[18px]">
                  {register && (
                    <label className={s.authLabel}>
                      昵称
                      <Input
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        required
                        minLength={1}
                        maxLength={40}
                        autoComplete="nickname"
                        aria-invalid={!!fields.displayName}
                        aria-describedby={fields.displayName ? 'auth-name-error' : undefined}
                      />
                      {fields.displayName && (
                        <span id="auth-name-error" className="field-error">
                          {fields.displayName.join('；')}
                        </span>
                      )}
                    </label>
                  )}
                  <label className={s.authLabel}>
                    邮箱
                    <Input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                      maxLength={254}
                      autoComplete="username"
                      placeholder="student@example.com"
                      aria-invalid={!!fields.email}
                      aria-describedby={fields.email ? 'auth-email-error' : undefined}
                    />
                    {fields.email && (
                      <span id="auth-email-error" className="field-error">
                        {fields.email.join('；')}
                      </span>
                    )}
                  </label>
                  <label className={s.authLabel}>
                    密码
                    <Input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                      minLength={register ? 12 : 1}
                      maxLength={128}
                      autoComplete={register ? 'new-password' : 'current-password'}
                      placeholder={register ? '至少 12 位，建议使用独立密码' : '输入账号密码'}
                      aria-invalid={!!fields.password}
                      aria-describedby={fields.password ? 'auth-password-error' : undefined}
                    />
                    {fields.password && (
                      <span id="auth-password-error" className="field-error">
                        {fields.password.join('；')}
                      </span>
                    )}
                  </label>
                  {error && (
                    <div role="alert" className="field-error break-words">
                      {error}
                      {requestId && (
                        <small className="block mt-2 text-muted-foreground">
                          请求编号：{requestId}
                        </small>
                      )}
                    </div>
                  )}
                  <Button type="submit" disabled={campus.busy}>
                    {campus.busy && <LoaderCircle size={16} className="animate-spin" />}
                    {register ? '注册' : '登录'}
                    <ArrowRight size={15} />
                  </Button>
                </fieldset>
              </form>
              <p className={s.authFine}>
                <ShieldCheck size={12} className="inline mr-1" />
                密码仅用于本次身份验证，不会写入浏览器本地存储。演示资料与云端账号分别保存。
              </p>
              <p className="text-xs text-muted-foreground text-center mt-7">
                {register ? '已经有账号？' : '第一次来到这里？'}{' '}
                <Link className="text-primary" href={register ? '/login' : '/register'}>
                  {register ? '返回登录' : '创建账号'}
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
