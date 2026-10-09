import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Sparkles,
  FlaskConical,
  Network,
  Target,
  FileText,
  Eye,
  EyeOff,
  ArrowRight,
  MailCheck,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Button, ErrorBanner, Spinner } from "./ui";
import { APP_NAME, APP_TAGLINE } from "../lib/constants";
import type { ProfessionalRole } from "../lib/types";

const STAGE_PREVIEW = [
  { icon: Network, label: "Search 5 academic sources" },
  { icon: Sparkles, label: "Map the knowledge landscape" },
  { icon: Target, label: "Detect the research gap" },
  { icon: FlaskConical, label: "Formulate hypothesis + experiment" },
  { icon: FileText, label: "Generate a full proposal" },
];

const OWNER_PREVIEW = [
  { icon: Network, label: "Monitor platform activity and research usage" },
  { icon: Target, label: "Review Professor and Lab Admin access" },
  { icon: FlaskConical, label: "Track API usage and rate-limit events" },
  { icon: FileText, label: "Manage packages, pricing and subscriptions" },
  { icon: Sparkles, label: "Keep the public experience in sync" },
];

export function AuthScreen({ ownerOnly = false }: { ownerOnly?: boolean }) {
  const {
    signIn,
    signUp,
    resendConfirmation,
    requestPasswordReset,
    updatePassword,
    passwordRecovery,
    loading,
    session,
    isOwnerAdmin,
  } = useAuth();
  const navigate = useNavigate();
  const recoveryLink = new URLSearchParams(window.location.search).get("recovery") === "1";
  const requestedMode = new URLSearchParams(window.location.search).get("mode");
  const requestedPlan = new URLSearchParams(window.location.search).get("plan") ?? "starter";
  const [mode, setMode] = useState<"signin" | "signup" | "forgot" | "reset">(
    recoveryLink ? "reset" : !ownerOnly && requestedMode === "signup" ? "signup" : "signin",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<ProfessionalRole>("student");
  const [institution, setInstitution] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmMsg, setConfirmMsg] = useState<string | null>(null);
  const [confirmationEmail, setConfirmationEmail] = useState("");
  const previewItems = ownerOnly ? OWNER_PREVIEW : STAGE_PREVIEW;

  useEffect(() => {
    if (passwordRecovery || recoveryLink) {
      setMode("reset");
      return;
    }
    if (session && (!ownerOnly || isOwnerAdmin)) navigate(ownerOnly ? "/admin" : "/dashboard", { replace: true });
  }, [isOwnerAdmin, navigate, ownerOnly, passwordRecovery, recoveryLink, session]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setConfirmMsg(null);
    if (mode === "forgot") {
      if (!email.trim()) {
        setError("Please enter your email address.");
        return;
      }
      setBusy(true);
      const res = await requestPasswordReset(email.trim());
      setBusy(false);
      if (res.error) setError(res.error);
      else setConfirmMsg("If an account exists for that email, a password reset link has been sent.");
      return;
    }
    if (mode === "reset") {
      if (password.length < 8) {
        setError("Your new password needs to be at least 8 characters.");
        return;
      }
      setBusy(true);
      const res = await updatePassword(password);
      setBusy(false);
      if (res.error) setError(res.error);
      else navigate(ownerOnly ? "/admin" : "/dashboard", { replace: true });
      return;
    }
    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }
    if (mode === "signup" && !name.trim()) {
      setError("Please enter your full name.");
      return;
    }
    if (mode === "signup" && password.length < 8) {
      setError("Your password needs to be at least 8 characters.");
      return;
    }
    setBusy(true);
    const res = mode === "signin"
      ? await signIn(email.trim(), password)
      : await signUp(email.trim(), password, name.trim(), role, institution.trim(), requestedPlan);
    setBusy(false);
    if (res.error === "confirm") {
      setConfirmMsg(
        "Almost there! We sent a confirmation link to your inbox. Open it, then sign in below.",
      );
      setConfirmationEmail(email.trim());
      setMode("signin");
      return;
    }
    if (res.error) setError(res.error);
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Brand / pitch panel */}
      <div className="bg-dotgrid-glow relative hidden flex-1 flex-col justify-between overflow-hidden p-10 lg:flex">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-on-primary shadow-[0_0_28px_-4px_var(--color-primary)]">
            <Sparkles size={18} aria-hidden="true" />
          </div>
          <div>
            <div className="font-heading text-xl font-semibold leading-none text-foreground">{ownerOnly ? `${APP_NAME} Owner Control` : APP_NAME}</div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-primary">{ownerOnly ? "Private administration portal" : APP_TAGLINE}</div>
          </div>
        </div>

        <div className="max-w-lg">
          <h1 className="font-heading text-5xl leading-[1.05] text-foreground">
            {ownerOnly ? <>Control the platform with <span className="text-glow-cyan text-primary">confidence</span>.</> : <>Research at the speed of <span className="text-glow-cyan text-primary">thought</span>.</>}
          </h1>
          <p className="mt-4 text-base text-foreground/65">
            {ownerOnly ? "A separate operational console for platform health, access approvals, subscriptions, pricing and API activity." : "Ask a question. NOVA plans, searches, reads, and reasons across the literature — then hands you a gap analysis, a hypothesis, an experiment design, and a written proposal."}
          </p>
          <ul className="mt-8 space-y-3">
            {previewItems.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-3 text-sm text-foreground/75">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon size={16} aria-hidden="true" />
                </span>
                {label}
              </li>
            ))}
          </ul>
        </div>

        <div className="text-xs text-foreground/40">
          {ownerOnly ? "Access is restricted to verified platform owners." : "Signing in lets you save runs and collaborate on shared research projects."}
        </div>
      </div>

      {/* Form panel */}
      <div className="flex w-full flex-col items-center justify-center bg-background px-6 py-12 lg:w-[42rem]">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-on-primary">
              <Sparkles size={18} aria-hidden="true" />
            </div>
            <div>
              <div className="font-heading text-lg font-semibold leading-none text-foreground">{ownerOnly ? `${APP_NAME} Owner Control` : APP_NAME}</div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-primary">{ownerOnly ? "Private administration portal" : APP_TAGLINE}</div>
            </div>
          </div>

          <h2 className="font-heading text-2xl text-foreground">
            {mode === "signin"
              ? "Welcome back"
              : mode === "signup"
                ? "Create your workspace"
                : mode === "forgot"
                  ? "Reset your password"
                  : "Choose a new password"}
          </h2>
          <p className="mt-1 text-sm text-foreground/55">
            {mode === "signin"
              ? ownerOnly ? "Sign in with an authorized Owner Admin account." : "Sign in to continue your research."
              : mode === "signup"
                ? "Start running autonomous research in seconds."
                : mode === "forgot"
                  ? "We'll email a secure recovery link if the account exists."
                  : "Use at least 8 characters for your new password."}
          </p>

          {!ownerOnly && mode !== "forgot" && mode !== "reset" ? <div className="mt-6 grid grid-cols-2 rounded-xl border border-border bg-panel p-1 text-sm font-medium">
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setError(null); setConfirmMsg(null); }}
                aria-pressed={mode === m}
                className={`cursor-pointer rounded-lg px-3 py-2 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                  mode === m ? "bg-primary text-on-primary" : "text-foreground/70 hover:text-foreground"
                }`}
              >
                {m === "signin" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div> : null}

          {ownerOnly && session && !loading && !isOwnerAdmin ? <ErrorBanner className="mt-4">This account does not have Owner Admin access. Sign out and use the authorized owner account.</ErrorBanner> : null}
          {error ? <ErrorBanner className="mt-4">{error}</ErrorBanner> : null}
          {confirmMsg ? (
            <div role="status" className="mt-4 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-primary">
              <div className="flex items-start gap-2"><MailCheck size={17} className="mt-0.5 shrink-0" />{confirmMsg}</div>
              {confirmationEmail ? <button type="button" onClick={async () => {
                setBusy(true);
                const result = await resendConfirmation(confirmationEmail);
                setBusy(false);
                if (result.error) setError(result.error);
                else setConfirmMsg("A new confirmation link has been sent. Check spam or promotions if it is not in your inbox.");
              }} className="mt-2 cursor-pointer text-xs font-semibold underline underline-offset-2" disabled={busy}>Resend confirmation email</button> : null}
            </div>
          ) : null}

          <form onSubmit={submit} className="mt-6 space-y-4">
            {mode === "signup" ? (
              <>
                {requestedPlan !== "starter" ? <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-xs capitalize text-primary">Selected package: <span className="font-semibold">{requestedPlan.replace(/-/g, " ")}</span>. It remains pending until billing is connected or Owner Admin activates it.</div> : null}
                <label className="block">
                  <span className="mb-1.5 block text-sm text-foreground/70">Full name</span>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Dr. Ada Lovelace"
                    autoComplete="name"
                    className="w-full rounded-xl border border-border bg-panel px-4 py-2.5 text-sm text-foreground placeholder:text-foreground/35 focus:border-primary focus:outline-2 focus:outline-primary/50"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm text-foreground/70">Professional role</span>
                  <select
                    value={role}
                    onChange={(event) => setRole(event.target.value as ProfessionalRole)}
                    className="w-full cursor-pointer rounded-xl border border-border bg-panel px-4 py-2.5 text-sm text-foreground focus:border-primary focus:outline-2 focus:outline-primary/50"
                  >
                    <option value="student">Student</option>
                    <option value="research_assistant">Research Assistant</option>
                    <option value="professor">Professor</option>
                    <option value="lab_admin">Research Lab Admin</option>
                  </select>
                  <span className="mt-1 block text-[11px] text-foreground/45">Professor and Lab Admin accounts open immediately; privileged tools unlock after Owner Admin approval.</span>
                </label>
                {role === "professor" || role === "lab_admin" ? <label className="block">
                  <span className="mb-1.5 block text-sm text-foreground/70">University or research institution</span>
                  <input type="text" value={institution} onChange={(event) => setInstitution(event.target.value)} placeholder="University / laboratory name" required className="w-full rounded-xl border border-border bg-panel px-4 py-2.5 text-sm text-foreground placeholder:text-foreground/35 focus:border-primary focus:outline-2 focus:outline-primary/50" />
                </label> : null}
              </>
            ) : null}

            {mode !== "reset" ? <label className="block">
              <span className="mb-1.5 block text-sm text-foreground/70">Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@university.edu"
                autoComplete="email"
                required
                className="w-full rounded-xl border border-border bg-panel px-4 py-2.5 text-sm text-foreground placeholder:text-foreground/35 focus:border-primary focus:outline-2 focus:outline-primary/50"
              />
            </label> : null}

            {mode !== "forgot" ? <label className="block">
              <span className="mb-1.5 block text-sm text-foreground/70">{mode === "reset" ? "New password" : "Password"}</span>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  required
                  className="w-full rounded-xl border border-border bg-panel px-4 py-2.5 pr-11 text-sm text-foreground placeholder:text-foreground/35 focus:border-primary focus:outline-2 focus:outline-primary/50"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-foreground/50 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label> : null}

            <Button type="submit" size="lg" className="w-full" disabled={busy || loading}>
              {busy ? <Spinner size={16} /> : null}
              {mode === "signin"
                ? "Sign in"
                : mode === "signup"
                  ? "Create account"
                  : mode === "forgot"
                    ? "Send reset link"
                    : "Update password"}
              {!busy ? <ArrowRight size={16} /> : null}
            </Button>
          </form>

          {mode === "signin" ? (
            <button
              type="button"
              onClick={() => { setMode("forgot"); setError(null); setConfirmMsg(null); }}
              className="mt-4 w-full cursor-pointer text-center text-xs text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring"
            >
              Forgot your password?
            </button>
          ) : mode === "forgot" ? (
            <button
              type="button"
              onClick={() => { setMode("signin"); setError(null); setConfirmMsg(null); }}
              className="mt-4 w-full cursor-pointer text-center text-xs text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring"
            >
              Back to sign in
            </button>
          ) : null}

          {!ownerOnly && mode !== "forgot" && mode !== "reset" ? <p className="mt-6 text-center text-xs text-foreground/45">
            {mode === "signin"
              ? "No account? Tap “Create account” above — it takes a minute."
              : "By continuing you agree to treat research data responsibly."}
          </p> : null}
          {ownerOnly
            ? <a href={import.meta.env.VITE_MAIN_APP_URL || "https://nova-research-scientist.vercel.app"} className="mt-4 block text-center text-xs text-foreground/45 hover:text-primary">← Back to NOVA website</a>
            : <Link to="/" className="mt-4 block text-center text-xs text-foreground/45 hover:text-primary">← Back to NOVA overview</Link>}
        </div>
      </div>
    </div>
  );
}
