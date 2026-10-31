import {
  lazy,
  Suspense,
  Component,
  type ReactNode,
  type ErrorInfo,
} from "react";
import { BrowserRouter, Routes, Route, Link, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import {
  AccountProvider,
  ApiShell,
  RequireAccount,
  useAccount,
} from "./api-shell";
import { AnimatedAuthPage } from "../features/auth/AnimatedAuthPage";
import { ApiAdminUsersPage } from "../features/admin-users-api";
import { ApiLandingPage } from "../features/landing-api";
import { ApiJobsPage, ApiJobDetailPage } from "../features/jobs-api";
import {
  ApiAuthPage,
  ApiMePage,
  ApiSettingsPage,
  ApiOnboardingPage,
} from "../features/auth-api";
import {
  ApiFavoritesPage,
  ApiServicesPage,
} from "../features/account-extra-api";
const Pipeline = lazy(() =>
  import("../features/pipeline-api").then((m) => ({
    default: m.ApiPipelinePage,
  })),
);
const Knowledge = () => import("../features/knowledge-api");
const Experiences = lazy(() =>
    Knowledge().then((m) => ({ default: m.ApiExperiencesPage })),
  ),
  ExperienceSubmissions = lazy(() =>
    Knowledge().then((m) => ({ default: m.ApiExperienceSubmissionsPage })),
  ),
  Experience = lazy(() =>
    Knowledge().then((m) => ({ default: m.ApiExperienceDetailPage })),
  ),
  Questions = lazy(() =>
    Knowledge().then((m) => ({ default: m.ApiQuestionsPage })),
  ),
  Handbook = lazy(() =>
    Knowledge().then((m) => ({ default: m.ApiHandbookPage })),
  ),
  Company = lazy(() =>
    Knowledge().then((m) => ({ default: m.ApiCompanyPage })),
  ),
  Pack = lazy(() =>
    Knowledge().then((m) => ({ default: m.ApiCompanyPackPage })),
  ),
  Style = lazy(() =>
    Knowledge().then((m) => ({ default: m.ApiCompanyStylePage })),
  );
const Personal = () => import("../features/personal-api");
const Calendar = lazy(() =>
    Personal().then((m) => ({ default: m.ApiCalendarPage })),
  ),
  Planner = lazy(() => Personal().then((m) => ({ default: m.ApiPlannerPage }))),
  Offers = lazy(() => Personal().then((m) => ({ default: m.ApiOffersPage }))),
  Analytics = lazy(() =>
    Personal().then((m) => ({ default: m.ApiAnalyticsPage })),
  ),
  Timeline = lazy(() =>
    Personal().then((m) => ({ default: m.ApiTimelinePage })),
  ),
  Review = lazy(() => Personal().then((m) => ({ default: m.ApiReviewPage }))),
  Salary = lazy(() => Personal().then((m) => ({ default: m.ApiSalaryPage })));
const Submissions = lazy(() =>
  import("../features/submissions").then((m) => ({
    default: m.ApiSubmissionsPage,
  })),
);
const CommunityComments = lazy(() =>
  import("../features/submissions").then((m) => ({
    default: m.ApiCommunityCommentsPage,
  })),
);
const ReferralSubmissions = lazy(() =>
  import("../features/submissions").then((m) => ({
    default: m.ApiReferralSubmissionsPage,
  })),
);
const SalarySubmissions = lazy(() =>
  import("../features/salary-page").then((m) => ({
    default: m.ApiSalarySubmissionsPage,
  })),
);
const Resume = () => import("../features/resume-api");
const Resumes = lazy(() =>
    Resume().then((m) => ({ default: m.ApiResumesPage })),
  ),
  ResumeCheck = lazy(() =>
    Resume().then((m) => ({ default: m.ApiResumeCheckPage })),
  );
const Mock = lazy(() =>
  import("../features/practice-api").then((m) => ({ default: m.ApiMockPage })),
);
const Social = () => import("../features/social-api");
const Community = lazy(() =>
    Social().then((m) => ({ default: m.ApiCommunityPage })),
  ),
  CommunitySubmissions = lazy(() =>
    Social().then((m) => ({ default: m.ApiCommunitySubmissionsPage })),
  ),
  Buddy = lazy(() => Social().then((m) => ({ default: m.ApiBuddyPage }))),
  Referral = lazy(() => Social().then((m) => ({ default: m.ApiReferralPage }))),
  Radar = lazy(() => Social().then((m) => ({ default: m.ApiRadarPage })));
const Notifications = lazy(() =>
    import("../features/notification-api").then((m) => ({
      default: m.ApiNotificationsPage,
    })),
  ),
  Subscriptions = lazy(() =>
    import("../features/notification-api").then((m) => ({
      default: m.ApiSubscriptionsPage,
    })),
  );
const Admin = lazy(() =>
  import("../features/admin-api").then((m) => ({ default: m.ApiAdminPage })),
);
class ApiBoundary extends Component<
  { children: ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("页面加载失败", error.message, info.componentStack);
  }
  render() {
    return this.state.error ? (
      <div className="page-error">
        <h1>页面暂时无法打开</h1>
        <p>可以刷新页面后重试；尚未保存的输入请先复制保留。</p>
        <button className="button" onClick={() => location.reload()}>
          刷新
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
function Missing() {
  return (
    <div className="page-error">
      <h1>页面不存在</h1>
      <Link className="button button-primary" to="/jobs">
        返回岗位广场
      </Link>
    </div>
  );
}
const secured = (node: ReactNode, admin = false) => (
  <RequireAccount audience={admin ? "management" : "user"}>
    {node}
  </RequireAccount>
);
function AccountSettings() {
  const { user } = useAccount();
  return (
    <RequireAccount>{user && <ApiSettingsPage key={user.id} />}</RequireAccount>
  );
}
export function ApiApp() {
  return (
    <ApiBoundary>
      <BrowserRouter>
        <AccountProvider>
          <Suspense
            fallback={<div className="loading-page">正在打开校招雷达…</div>}
          >
            <Routes>
              <Route path="/" element={<ApiLandingPage />} />
              <Route element={<AnimatedAuthPage />}>
                <Route path="/login" />
                <Route path="/register" />
              </Route>
              {["forgot-password", "reset-password"].map((p) => (
                <Route key={p} path={`/${p}`} element={<ApiAuthPage />} />
              ))}
              {["verify-email", "resend-verification"].map((p) => (
                <Route
                  key={p}
                  path={`/${p}`}
                  element={<Navigate to="/login" replace />}
                />
              ))}
              <Route
                path="/onboarding"
                element={secured(<ApiOnboardingPage />)}
              />
              <Route element={<ApiShell />}>
                <Route path="/jobs" element={<ApiJobsPage />} />
                <Route path="/jobs/:id" element={<ApiJobDetailPage />} />
                <Route path="/company/:id" element={<Company />} />
                <Route path="/pipeline" element={secured(<Pipeline />)} />
                <Route path="/calendar" element={secured(<Calendar />)} />
                <Route path="/analytics" element={secured(<Analytics />)} />
                <Route path="/resumes" element={secured(<Resumes />)} />
                <Route
                  path="/interview/:id/timeline"
                  element={secured(<Timeline />)}
                />
                <Route
                  path="/interview/:id/review"
                  element={secured(<Review />)}
                />
                <Route path="/mock" element={secured(<Mock />)} />
                <Route
                  path="/resume-check"
                  element={secured(<ResumeCheck />)}
                />
                <Route path="/experiences" element={<Experiences />} />
                <Route
                  path="/experiences/submissions"
                  element={secured(<ExperienceSubmissions />)}
                />
                <Route path="/experiences/:id" element={<Experience />} />
                <Route path="/questions" element={<Questions />} />
                <Route path="/handbook" element={<Handbook />} />
                <Route path="/pack/:companySlug" element={<Pack />} />
                <Route path="/style/:companySlug" element={<Style />} />
                <Route path="/planner" element={secured(<Planner />)} />
                <Route path="/salary" element={<Salary />} />
                <Route
                  path="/salary/submissions"
                  element={secured(<SalarySubmissions />)}
                />
                <Route path="/offer-compare" element={secured(<Offers />)} />
                <Route path="/community" element={<Community />} />
                <Route
                  path="/community/submissions"
                  element={secured(<CommunitySubmissions />)}
                />
                <Route
                  path="/submissions/community"
                  element={secured(<CommunitySubmissions />)}
                />
                <Route path="/buddy" element={secured(<Buddy />)} />
                <Route path="/radar" element={<Radar />} />
                <Route
                  path="/subscriptions"
                  element={secured(<Subscriptions />)}
                />
                <Route path="/referral" element={<Referral />} />
                <Route
                  path="/referral/submissions"
                  element={secured(<ReferralSubmissions />)}
                />
                <Route path="/submissions" element={secured(<Submissions />)} />
                <Route
                  path="/submissions/comments"
                  element={secured(<CommunityComments />)}
                />
                <Route path="/me" element={secured(<ApiMePage />)} />
                <Route
                  path="/favorites"
                  element={secured(<ApiFavoritesPage />)}
                />
                <Route
                  path="/notifications"
                  element={secured(<Notifications />)}
                />
                <Route path="/settings" element={<AccountSettings />} />
                <Route path="/admin" element={secured(<Admin />, true)} />
                <Route
                  path="/admin/services"
                  element={
                    <RequireAccount audience="admin">
                      <ApiServicesPage />
                    </RequireAccount>
                  }
                />
                <Route
                  path="/admin/users"
                  element={
                    <RequireAccount audience="admin">
                      <ApiAdminUsersPage />
                    </RequireAccount>
                  }
                />
              </Route>
              <Route path="*" element={<Missing />} />
            </Routes>
          </Suspense>
          <Toaster theme="system" richColors position="top-right" closeButton />
        </AccountProvider>
      </BrowserRouter>
    </ApiBoundary>
  );
}
