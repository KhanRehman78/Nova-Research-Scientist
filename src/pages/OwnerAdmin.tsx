import { useCallback, useEffect, useState } from "react";
import {
  Activity, BadgeCheck, BookOpen, Check, CircleDollarSign, Database,
  FileText, FolderKanban, Gauge, KeyRound, PackageCheck, PencilLine, Plus,
  RefreshCw, Save, Search, UserCheck, Users, X,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import type { PricingPlan, ProfessionalRoleRequest } from "../lib/types";
import { DEFAULT_PRICING_PLANS, formatMonthlyPrice } from "../lib/pricing";
import { Button, Chip, EmptyState, ErrorBanner, PageHeader, Spinner, StatCard } from "../components/ui";
import { ROLE_LABEL } from "../lib/constants";
import { useAuth } from "../context/AuthContext";

type AdminSummary = {
  users: number;
  active_users_30d: number;
  projects: number;
  research_runs: number;
  completed_runs: number;
  papers: number;
  manuscripts: number;
  professional_outputs: number;
  pending_role_requests: number;
  active_pricing_plans: number;
  active_subscriptions: number;
  package_selections: number;
  api_requests_today: number;
  api_requests_30d: number;
  api_blocked_30d: number;
  subscriptions_by_plan: { plan_id: string; plan_name: string; total: number; active: number }[];
  recent_events: { event_type: string; title: string; detail: string; event_at: string }[];
};

type AdminUser = {
  user_id: string;
  email: string;
  full_name: string;
  role: string;
  privileged_role_verified: boolean;
  institution: string;
  requested_role: string | null;
  request_status: string | null;
  plan_id: string | null;
  plan_name: string | null;
  subscription_status: string | null;
  billing_cycle: string | null;
  created_at: string;
  last_sign_in_at: string | null;
};

type AdminRoleRequest = ProfessionalRoleRequest & {
  profiles: { full_name: string; role: string } | null;
};

type ApiUsage = {
  request_count: number;
  allowed_count: number;
  blocked_count: number;
  active_users: number;
  by_bucket: { bucket: string; request_count: number; blocked_count: number }[];
  by_user: { user_id: string; user_name: string; email: string; request_count: number; blocked_count: number }[];
  daily: { usage_date: string; request_count: number; blocked_count: number }[];
};

const FIELD = "w-full rounded-xl border border-border bg-background/70 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-2 focus:outline-ring";

export function OwnerAdmin() {
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [requests, setRequests] = useState<AdminRoleRequest[]>([]);
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [apiUsage, setApiUsage] = useState<ApiUsage | null>(null);
  const [tab, setTab] = useState<"overview" | "access" | "subscriptions" | "api" | "pricing" | "users" | "security">("overview");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setBusy("load");
    setError(null);
    const [summaryResult, usersResult, requestsResult, pricingResult, usageResult] = await Promise.all([
      supabase.rpc("get_platform_admin_dashboard"),
      supabase.rpc("get_platform_admin_users"),
      supabase.from("professional_role_requests").select("*, profiles!professional_role_requests_profile_id_fkey(full_name, role)").order("created_at", { ascending: false }),
      supabase.from("pricing_plans").select("*").order("sort_order"),
      supabase.rpc("get_platform_admin_api_usage", { p_days: 30 }),
    ]);
    const firstError = summaryResult.error || usersResult.error || requestsResult.error || pricingResult.error || usageResult.error;
    if (firstError) setError(firstError.message);
    setSummary((summaryResult.data as AdminSummary | null) ?? null);
    setUsers((usersResult.data as AdminUser[]) ?? []);
    setRequests((requestsResult.data as AdminRoleRequest[]) ?? []);
    setPlans((pricingResult.data as PricingPlan[]) ?? DEFAULT_PRICING_PLANS);
    setApiUsage((usageResult.data as ApiUsage | null) ?? null);
    setBusy(null);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const reviewRequest = async (requestId: string, decision: "approved" | "rejected") => {
    setBusy(requestId);
    setError(null);
    const { error: reviewError } = await supabase.rpc("review_professional_role_request", {
      p_request_id: requestId,
      p_decision: decision,
      p_review_note: decision === "approved" ? "Institutional role approved by Owner Admin." : "Role request requires additional verification.",
    });
    if (reviewError) setError(reviewError.message);
    else await load();
    setBusy(null);
  };

  const updatePlan = (id: string, patch: Partial<PricingPlan>) => {
    setPlans((current) => current.map((plan) => plan.id === id ? { ...plan, ...patch } : plan));
  };

  const savePlan = async (plan: PricingPlan) => {
    setBusy(plan.id);
    setError(null);
    const payload = {
      id: plan.id,
      name: plan.name.trim(),
      audience: plan.audience.trim(),
      description: plan.description.trim(),
      monthly_price_pkr: plan.monthly_price_pkr,
      yearly_price_pkr: plan.yearly_price_pkr,
      features: plan.features.filter(Boolean),
      cta_label: plan.cta_label.trim() || "Get started",
      is_featured: plan.is_featured,
      is_active: plan.is_active,
      sort_order: plan.sort_order,
    };
    const { error: saveError } = await supabase.from("pricing_plans").upsert(payload);
    if (saveError) setError(saveError.message);
    else await load();
    setBusy(null);
  };

  const addPlan = () => {
    const id = `plan-${Date.now()}`;
    setPlans((current) => [...current, { id, name: "New plan", audience: "Define audience", description: "Describe this package.", monthly_price_pkr: 0, yearly_price_pkr: 0, features: ["Feature one"], cta_label: "Get started", is_featured: false, is_active: false, sort_order: (current.length + 1) * 10 }]);
  };

  const updateUserSubscription = (userId: string, patch: Partial<AdminUser>) => {
    setUsers((current) => current.map((user) => user.user_id === userId ? { ...user, ...patch } : user));
  };

  const saveSubscription = async (account: AdminUser) => {
    if (!account.plan_id || !account.subscription_status || !account.billing_cycle) return;
    setBusy(`subscription-${account.user_id}`);
    setError(null);
    const { error: subscriptionError } = await supabase.rpc("set_account_subscription", {
      p_profile_id: account.user_id,
      p_plan_id: account.plan_id,
      p_status: account.subscription_status,
      p_billing_cycle: account.billing_cycle,
    });
    if (subscriptionError) setError(subscriptionError.message);
    else await load();
    setBusy(null);
  };

  const filteredUsers = users.filter((user) => `${user.full_name} ${user.email} ${user.role} ${user.institution}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="bg-dotgrid-glow min-h-full">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-10">
        <PageHeader eyebrow="SaaS control plane" title="Owner Admin" subtitle="Platform health, user access, professional role approvals and landing-page pricing in one protected workspace." right={<Button variant="secondary" onClick={() => void load()} disabled={busy === "load"}>{busy === "load" ? <Spinner size={14} /> : <RefreshCw size={14} />}Refresh</Button>} />
        {error ? <ErrorBanner className="mb-5">{error}</ErrorBanner> : null}

        <nav className="mb-6 flex gap-2 overflow-x-auto rounded-2xl border border-border bg-panel/55 p-1.5" aria-label="Admin sections">
          {([['overview', 'Overview'], ['access', 'Role approvals'], ['subscriptions', 'Packages'], ['api', 'API usage'], ['pricing', 'Pricing'], ['users', 'Users'], ['security', 'Security']] as const).map(([key, label]) => <button key={key} onClick={() => setTab(key)} className={`shrink-0 cursor-pointer rounded-xl px-4 py-2 text-sm ${tab === key ? "bg-primary font-semibold text-on-primary" : "text-foreground/60 hover:bg-border/30 hover:text-foreground"}`}>{label}{key === "access" && summary?.pending_role_requests ? <span className="ml-2 rounded-full bg-warning px-1.5 py-0.5 text-[10px] text-background">{summary.pending_role_requests}</span> : null}</button>)}
        </nav>

        {tab === "overview" ? <Overview summary={summary} loading={busy === "load"} /> : null}
        {tab === "access" ? <RoleApprovals requests={requests} busy={busy} onReview={reviewRequest} /> : null}
        {tab === "subscriptions" ? <Subscriptions users={users} plans={plans} busy={busy} onChange={updateUserSubscription} onSave={saveSubscription} /> : null}
        {tab === "api" ? <ApiUsagePanel usage={apiUsage} /> : null}
        {tab === "pricing" ? <PricingEditor plans={plans} busy={busy} onChange={updatePlan} onSave={savePlan} onAdd={addPlan} /> : null}
        {tab === "users" ? <UsersTable users={filteredUsers} query={query} onQuery={setQuery} /> : null}
        {tab === "security" ? <SecuritySettings /> : null}
      </div>
    </div>
  );
}

function Overview({ summary, loading }: { summary: AdminSummary | null; loading: boolean }) {
  if (loading && !summary) return <div className="flex justify-center py-20"><Spinner size={28} className="text-primary" /></div>;
  if (!summary) return <EmptyState icon={Database} title="Admin data unavailable" body="Apply the SaaS control-plane migration and grant an Owner Admin account." />;
  return <>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      <StatCard label="Accounts" value={summary.users} sub={`${summary.active_users_30d} active in 30 days`} icon={Users} />
      <StatCard label="Projects" value={summary.projects} sub="research workspaces" icon={FolderKanban} accent="text-secondary" />
      <StatCard label="Research runs" value={summary.research_runs} sub={`${summary.completed_runs} completed`} icon={Activity} accent="text-success" />
      <StatCard label="Papers" value={summary.papers} sub="evidence records" icon={BookOpen} accent="text-warning" />
      <StatCard label="Manuscripts" value={summary.manuscripts} sub={`${summary.professional_outputs} professional outputs`} icon={FileText} />
      <StatCard label="API requests" value={summary.api_requests_30d} sub={`${summary.api_requests_today} today · ${summary.api_blocked_30d} blocked`} icon={Gauge} accent="text-secondary" />
    </div>
    <div className="mt-6 grid gap-5 xl:grid-cols-[1.4fr_.6fr]">
      <section className="glass-panel rounded-3xl p-5"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-heading text-xl">Platform track record</h2><p className="text-xs text-foreground/45">Latest signup, research and manuscript events</p></div><Activity size={18} className="text-primary" /></div><div className="space-y-2">{summary.recent_events.map((event, index) => <div key={`${event.event_type}-${event.event_at}-${index}`} className="flex gap-3 rounded-2xl border border-border/70 bg-panel/50 p-3"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" /><div className="min-w-0 flex-1"><div className="truncate text-sm">{event.title}</div><div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-foreground/40"><span>{event.detail}</span><span>{new Date(event.event_at).toLocaleString()}</span></div></div></div>)}</div></section>
      <div className="space-y-4"><div className="glass-soft rounded-3xl p-5"><UserCheck className="text-warning" /><div className="mt-5 font-heading text-3xl">{summary.pending_role_requests}</div><div className="text-sm text-foreground/50">professional roles awaiting review</div></div><div className="glass-soft rounded-3xl p-5"><PackageCheck className="text-success" /><div className="mt-5 font-heading text-3xl">{summary.active_subscriptions}</div><div className="text-sm text-foreground/50">active or trial packages · {summary.package_selections} total selections</div><div className="mt-4 space-y-2">{summary.subscriptions_by_plan.map((plan) => <div key={plan.plan_id} className="flex items-center justify-between text-xs"><span className="text-foreground/55">{plan.plan_name}</span><span>{plan.active}/{plan.total}</span></div>)}</div></div><div className="glass-soft rounded-3xl p-5"><CircleDollarSign className="text-primary" /><div className="mt-5 font-heading text-3xl">{summary.active_pricing_plans}</div><div className="text-sm text-foreground/50">pricing packages visible publicly</div></div></div>
    </div>
  </>;
}

function RoleApprovals({ requests, busy, onReview }: { requests: AdminRoleRequest[]; busy: string | null; onReview: (id: string, decision: "approved" | "rejected") => Promise<void> }) {
  if (!requests.length) return <EmptyState icon={BadgeCheck} title="No role requests" body="Professor and Lab Admin signup requests will appear here." />;
  return <div className="grid gap-4 lg:grid-cols-2">{requests.map((request) => <article key={request.id} className="glass-panel rounded-3xl p-5"><div className="flex items-start justify-between gap-3"><div><div className="font-heading text-xl">{request.profiles?.full_name || "Unnamed account"}</div><div className="text-sm text-foreground/45">{request.institution || "Institution not supplied"}</div></div><Chip tone={request.status === "approved" ? "success" : request.status === "rejected" ? "danger" : "warning"}>{request.status}</Chip></div><div className="mt-5 rounded-2xl border border-border bg-panel/60 p-4"><div className="text-[10px] uppercase tracking-wider text-foreground/40">Requested access</div><div className="mt-1 font-medium text-primary">{ROLE_LABEL[request.requested_role]}</div><p className="mt-2 text-xs leading-relaxed text-foreground/50">{request.evidence_note || "Requested during signup."}</p></div><div className="mt-4 text-xs text-foreground/40">Submitted {new Date(request.created_at).toLocaleString()}</div>{request.status === "pending" ? <div className="mt-5 flex gap-2"><Button onClick={() => void onReview(request.id, "approved")} disabled={busy === request.id}>{busy === request.id ? <Spinner size={14} /> : <Check size={14} />}Approve</Button><Button variant="danger" onClick={() => void onReview(request.id, "rejected")} disabled={busy === request.id}><X size={14} />Reject</Button></div> : request.review_note ? <p className="mt-4 text-xs text-foreground/50">Review: {request.review_note}</p> : null}</article>)}</div>;
}

function Subscriptions({ users, plans, busy, onChange, onSave }: { users: AdminUser[]; plans: PricingPlan[]; busy: string | null; onChange: (userId: string, patch: Partial<AdminUser>) => void; onSave: (user: AdminUser) => Promise<void> }) {
  return <section className="glass-panel overflow-hidden rounded-3xl"><div className="border-b border-border p-5"><h2 className="font-heading text-2xl">Package activation register</h2><p className="mt-1 text-sm text-foreground/50">See who selected each package and manually manage status until automated billing is connected.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-sm"><thead className="bg-panel/70 text-[10px] uppercase tracking-wider text-foreground/40"><tr><th className="px-5 py-3">Account</th><th className="px-5 py-3">Package</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Cycle</th><th className="px-5 py-3">Action</th></tr></thead><tbody>{users.map((account) => <tr key={account.user_id} className="border-t border-border/70"><td className="px-5 py-4"><div className="font-medium">{account.full_name || "Unnamed"}</div><div className="text-xs text-foreground/40">{account.email}</div></td><td className="px-5 py-4"><select className={FIELD} value={account.plan_id ?? "starter"} onChange={(event) => onChange(account.user_id, { plan_id: event.target.value })}>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></td><td className="px-5 py-4"><select className={FIELD} value={account.subscription_status ?? "selected"} onChange={(event) => onChange(account.user_id, { subscription_status: event.target.value })}><option value="selected">Selected</option><option value="trialing">Trialing</option><option value="active">Active</option><option value="past_due">Past due</option><option value="cancelled">Cancelled</option></select></td><td className="px-5 py-4"><select className={FIELD} value={account.billing_cycle ?? "monthly"} onChange={(event) => onChange(account.user_id, { billing_cycle: event.target.value })}><option value="monthly">Monthly</option><option value="yearly">Yearly</option><option value="manual">Manual</option></select></td><td className="px-5 py-4"><Button size="sm" onClick={() => void onSave({ ...account, plan_id: account.plan_id ?? "starter", subscription_status: account.subscription_status ?? "selected", billing_cycle: account.billing_cycle ?? "monthly" })} disabled={busy === `subscription-${account.user_id}`}>{busy === `subscription-${account.user_id}` ? <Spinner size={13} /> : <Save size={13} />}Save</Button></td></tr>)}</tbody></table></div></section>;
}

function ApiUsagePanel({ usage }: { usage: ApiUsage | null }) {
  if (!usage) return <EmptyState icon={Gauge} title="No API usage data" body="Usage tracking begins after the SaaS database migration is applied." />;
  const maxBucket = Math.max(1, ...usage.by_bucket.map((row) => Number(row.request_count)));
  return <><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><StatCard label="Requests · 30 days" value={usage.request_count} sub="all protected Edge workflows" icon={Gauge} /><StatCard label="Allowed" value={usage.allowed_count} sub="served within rate limits" icon={Check} accent="text-success" /><StatCard label="Blocked" value={usage.blocked_count} sub="stopped by rate limiting" icon={X} accent="text-destructive" /><StatCard label="API users" value={usage.active_users} sub="distinct callers" icon={Users} accent="text-secondary" /></div><div className="mt-6 grid gap-5 xl:grid-cols-2"><section className="glass-panel rounded-3xl p-5"><h2 className="font-heading text-xl">Usage by API workflow</h2><p className="mt-1 text-xs text-foreground/45">Authenticated request counts from the last 30 days</p><div className="mt-5 space-y-4">{usage.by_bucket.map((row) => <div key={row.bucket}><div className="mb-1.5 flex justify-between text-xs"><span>{row.bucket}</span><span className="font-mono">{row.request_count} <span className="text-destructive">· {row.blocked_count} blocked</span></span></div><div className="h-2 overflow-hidden rounded-full bg-border/50"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(3, Number(row.request_count) / maxBucket * 100)}%` }} /></div></div>)}{!usage.by_bucket.length ? <div className="py-10 text-center text-sm text-foreground/40">No API requests recorded yet.</div> : null}</div></section><section className="glass-panel overflow-hidden rounded-3xl"><div className="p-5"><h2 className="font-heading text-xl">Usage by user</h2><p className="mt-1 text-xs text-foreground/45">Who used the APIs and how many calls they made</p></div><div className="max-h-[32rem] overflow-auto"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-panel text-[10px] uppercase tracking-wider text-foreground/40"><tr><th className="px-5 py-3">User</th><th className="px-5 py-3">Calls</th><th className="px-5 py-3">Blocked</th></tr></thead><tbody>{usage.by_user.map((row) => <tr key={row.user_id} className="border-t border-border/70"><td className="px-5 py-3"><div>{row.user_name}</div><div className="text-xs text-foreground/40">{row.email}</div></td><td className="px-5 py-3 font-mono">{row.request_count}</td><td className="px-5 py-3 font-mono text-destructive">{row.blocked_count}</td></tr>)}</tbody></table></div></section></div></>;
}

function SecuritySettings() {
  const { user, updatePassword, requestPasswordReset } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const changePassword = async () => {
    setMessage(null); setError(null);
    if (password.length < 12) { setError("Owner Admin password must contain at least 12 characters."); return; }
    if (password !== confirmPassword) { setError("Password confirmation does not match."); return; }
    setBusy(true);
    const result = await updatePassword(password);
    setBusy(false);
    if (result.error) setError(result.error);
    else { setPassword(""); setConfirmPassword(""); setMessage("Owner Admin password updated successfully."); }
  };

  const sendReset = async () => {
    if (!user?.email) return;
    setBusy(true); setError(null); setMessage(null);
    const result = await requestPasswordReset(user.email);
    setBusy(false);
    if (result.error) setError(result.error);
    else setMessage("A secure password-reset link was requested for the Owner Admin email.");
  };

  return <div className="mx-auto max-w-2xl"><section className="glass-panel rounded-3xl p-6"><div className="flex items-start gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><KeyRound size={20} /></span><div><h2 className="font-heading text-2xl">Owner account security</h2><p className="mt-1 text-sm text-foreground/50">Signed in as {user?.email}</p></div></div>{error ? <ErrorBanner className="mt-5">{error}</ErrorBanner> : null}{message ? <div className="mt-5 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">{message}</div> : null}<div className="mt-6 space-y-4"><label className="block text-xs text-foreground/55">New password<input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className={`${FIELD} mt-1`} placeholder="At least 12 characters" /></label><label className="block text-xs text-foreground/55">Confirm new password<input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className={`${FIELD} mt-1`} /></label><div className="flex flex-wrap gap-3"><Button onClick={() => void changePassword()} disabled={busy || !password}>{busy ? <Spinner size={14} /> : <KeyRound size={14} />}Change password</Button><Button variant="secondary" onClick={() => void sendReset()} disabled={busy}>Email reset link</Button></div></div></section></div>;
}

function PricingEditor({ plans, busy, onChange, onSave, onAdd }: { plans: PricingPlan[]; busy: string | null; onChange: (id: string, patch: Partial<PricingPlan>) => void; onSave: (plan: PricingPlan) => Promise<void>; onAdd: () => void }) {
  return <><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-heading text-2xl">Landing-page pricing</h2><p className="text-sm text-foreground/50">Changes are published to the pricing section immediately. Payments are not connected yet.</p></div><Button variant="secondary" onClick={onAdd}><Plus size={15} />Add package</Button></div><div className="grid gap-5 xl:grid-cols-2">{plans.map((plan) => { const price = formatMonthlyPrice(plan); return <article key={plan.id} className="glass-panel rounded-3xl p-5"><div className="mb-4 flex items-center justify-between"><div><Chip tone={plan.is_active ? "success" : "default"}>{plan.is_active ? "Public" : "Hidden"}</Chip><span className="ml-2 text-xs text-foreground/40">Preview: {price.value} {price.suffix}</span></div><PencilLine size={17} className="text-primary" /></div><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs text-foreground/55">Package name<input className={`${FIELD} mt-1`} value={plan.name} onChange={(event) => onChange(plan.id, { name: event.target.value })} /></label><label className="text-xs text-foreground/55">Audience<input className={`${FIELD} mt-1`} value={plan.audience} onChange={(event) => onChange(plan.id, { audience: event.target.value })} /></label><label className="text-xs text-foreground/55">Monthly PKR<input type="number" min="0" className={`${FIELD} mt-1`} value={plan.monthly_price_pkr ?? ""} onChange={(event) => onChange(plan.id, { monthly_price_pkr: event.target.value === "" ? null : Number(event.target.value) })} /></label><label className="text-xs text-foreground/55">Yearly PKR<input type="number" min="0" className={`${FIELD} mt-1`} value={plan.yearly_price_pkr ?? ""} onChange={(event) => onChange(plan.id, { yearly_price_pkr: event.target.value === "" ? null : Number(event.target.value) })} /></label></div><label className="mt-3 block text-xs text-foreground/55">Description<textarea rows={2} className={`${FIELD} mt-1 resize-y`} value={plan.description} onChange={(event) => onChange(plan.id, { description: event.target.value })} /></label><label className="mt-3 block text-xs text-foreground/55">Features — one per line<textarea rows={5} className={`${FIELD} mt-1 resize-y`} value={plan.features.join("\n")} onChange={(event) => onChange(plan.id, { features: event.target.value.split("\n") })} /></label><label className="mt-3 block text-xs text-foreground/55">Button label<input className={`${FIELD} mt-1`} value={plan.cta_label} onChange={(event) => onChange(plan.id, { cta_label: event.target.value })} /></label><div className="mt-4 flex flex-wrap gap-4 text-xs"><label className="flex items-center gap-2"><input type="checkbox" checked={plan.is_active} onChange={(event) => onChange(plan.id, { is_active: event.target.checked })} />Visible publicly</label><label className="flex items-center gap-2"><input type="checkbox" checked={plan.is_featured} onChange={(event) => onChange(plan.id, { is_featured: event.target.checked })} />Featured package</label></div><Button className="mt-5" onClick={() => void onSave(plan)} disabled={busy === plan.id}>{busy === plan.id ? <Spinner size={14} /> : <Save size={14} />}Save package</Button></article>; })}</div></>;
}

function UsersTable({ users, query, onQuery }: { users: AdminUser[]; query: string; onQuery: (value: string) => void }) {
  return <section className="glass-panel overflow-hidden rounded-3xl"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5"><div><h2 className="font-heading text-xl">All accounts</h2><p className="text-xs text-foreground/45">Authentication, professional role and recent access status</p></div><label className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/35" /><input className={`${FIELD} pl-9`} placeholder="Search users" value={query} onChange={(event) => onQuery(event.target.value)} /></label></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-panel/70 text-[10px] uppercase tracking-wider text-foreground/40"><tr><th className="px-5 py-3">Account</th><th className="px-5 py-3">Role</th><th className="px-5 py-3">Institution</th><th className="px-5 py-3">Created</th><th className="px-5 py-3">Last sign in</th></tr></thead><tbody>{users.map((user) => <tr key={user.user_id} className="border-t border-border/70"><td className="px-5 py-4"><div className="font-medium">{user.full_name || "Unnamed"}</div><div className="text-xs text-foreground/40">{user.email}</div></td><td className="px-5 py-4"><Chip tone={user.privileged_role_verified ? "success" : "default"}>{ROLE_LABEL[user.role] || user.role}</Chip>{user.request_status === "pending" ? <div className="mt-1 text-[10px] text-warning">Requests {ROLE_LABEL[user.requested_role || ""]}</div> : null}</td><td className="px-5 py-4 text-foreground/55">{user.institution || "—"}</td><td className="px-5 py-4 text-xs text-foreground/45">{new Date(user.created_at).toLocaleDateString()}</td><td className="px-5 py-4 text-xs text-foreground/45">{user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString() : "Never"}</td></tr>)}</tbody></table></div>{!users.length ? <div className="p-8 text-center text-sm text-foreground/45">No matching accounts.</div> : null}</section>;
}
