import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, BarChart3, BookOpenCheck, BrainCircuit, Check, ChevronRight,
  ClipboardCheck, FileSearch, FlaskConical, GraduationCap, LibraryBig,
  Menu, Network, PenLine, SearchCheck, ShieldCheck, Sparkles, UsersRound, X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import type { PricingPlan } from "../lib/types";
import { DEFAULT_PRICING_PLANS, formatMonthlyPrice } from "../lib/pricing";

const FEATURES = [
  { icon: SearchCheck, title: "Multi-source discovery", body: "Build a research corpus across academic sources, remove duplicates and retain the evidence trail." },
  { icon: Network, title: "Literature intelligence", body: "Compare methods, datasets, results and limitations inside a structured literature workspace." },
  { icon: FlaskConical, title: "Gap to experiment", body: "Turn evidence-backed gaps into testable hypotheses, objectives and experiment designs." },
  { icon: PenLine, title: "Writing Studio", body: "Draft, review and validate manuscripts with citation, methodology and readiness checks." },
  { icon: GraduationCap, title: "Professional Studio", body: "Give students structured guidance and professors research, review, grant and supervision tools." },
  { icon: ShieldCheck, title: "Human-review gates", body: "Keep provenance, evidence scope and academic responsibility visible throughout the workflow." },
];

const ROLES = [
  { icon: BookOpenCheck, title: "Students", body: "Plan research, understand papers, find defensible gaps and build proposals step by step." },
  { icon: BrainCircuit, title: "Researchers", body: "Accelerate literature synthesis, experiment design and research writing without losing traceability." },
  { icon: UsersRound, title: "Professors", body: "Review student progress, manuscripts, grants and evidence through verified professional access." },
  { icon: BarChart3, title: "Labs & institutions", body: "Coordinate research teams and monitor projects, outputs, risks and readiness from one workspace." },
];

const PIPELINE = ["Plan", "Search", "Analyze", "Gap", "Hypothesis", "Experiment", "Report"];

export function LandingPage() {
  const { session } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [plans, setPlans] = useState<PricingPlan[]>(DEFAULT_PRICING_PLANS);

  useEffect(() => {
    void supabase.from("pricing_plans").select("*").eq("is_active", true).order("sort_order").then(({ data }) => {
      if (data?.length) setPlans(data as PricingPlan[]);
    });
  }, []);

  const portalHref = session ? "/dashboard" : "/auth";

  return (
    <div className="bg-dotgrid-glow min-h-screen overflow-x-hidden">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link to="/" className="flex items-center gap-3" aria-label="NOVA home">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-on-primary shadow-[0_0_26px_-5px_var(--color-primary)]"><Sparkles size={20} /></span>
            <span><span className="block font-heading text-xl font-semibold leading-none">NOVA</span><span className="text-[9px] uppercase tracking-[0.22em] text-primary">Research intelligence</span></span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-foreground/65 md:flex" aria-label="Public navigation">
            <a href="#features" className="hover:text-primary">Features</a>
            <a href="#roles" className="hover:text-primary">For teams</a>
            <a href="#workflow" className="hover:text-primary">Workflow</a>
            <a href="#pricing" className="hover:text-primary">Pricing</a>
          </nav>
          <div className="hidden items-center gap-3 md:flex">
            <Link to={portalHref} className="rounded-xl px-4 py-2 text-sm text-foreground/75 hover:bg-border/30">{session ? "Open portal" : "Login"}</Link>
            <Link to={session ? "/dashboard" : "/auth?mode=signup"} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary shadow-[0_0_24px_-7px_var(--color-primary)]">Get started <ArrowRight size={15} /></Link>
          </div>
          <button onClick={() => setMenuOpen((open) => !open)} className="rounded-lg p-2 text-foreground md:hidden" aria-label="Toggle navigation">{menuOpen ? <X /> : <Menu />}</button>
        </div>
        {menuOpen ? <nav className="border-t border-border bg-background px-5 py-4 md:hidden"><div className="grid gap-2 text-sm">{["features", "roles", "workflow", "pricing"].map((id) => <a key={id} href={`#${id}`} onClick={() => setMenuOpen(false)} className="rounded-lg px-3 py-2 capitalize text-foreground/70 hover:bg-border/30">{id === "roles" ? "For teams" : id}</a>)}<Link to={portalHref} className="rounded-lg px-3 py-2 text-foreground">{session ? "Open portal" : "Login"}</Link><Link to="/auth?mode=signup" className="rounded-lg bg-primary px-3 py-2 text-center font-semibold text-on-primary">Get started</Link></div></nav> : null}
      </header>

      <main>
        <section className="relative mx-auto grid min-h-[46rem] max-w-7xl items-center gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[1.05fr_.95fr] lg:py-28">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary"><Sparkles size={13} /> Evidence-first AI research workspace</div>
            <h1 className="max-w-4xl font-heading text-5xl font-semibold leading-[.98] tracking-tight sm:text-6xl lg:text-7xl">From research question to <span className="text-glow-cyan text-primary">defensible output.</span></h1>
            <p className="mt-7 max-w-2xl text-lg leading-relaxed text-foreground/62">NOVA helps students, researchers, professors and labs discover literature, map evidence, identify research gaps, design experiments and prepare review-ready work in one traceable workspace.</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link to={session ? "/dashboard" : "/auth?mode=signup"} className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 font-semibold text-on-primary shadow-[0_0_30px_-8px_var(--color-primary)]">Start researching <ArrowRight size={18} /></Link>
              <Link to={portalHref} className="inline-flex items-center gap-2 rounded-xl border border-border bg-panel/70 px-6 py-3 font-semibold text-foreground hover:border-primary/40">{session ? "Open your workspace" : "Login to portal"} <ChevronRight size={18} /></Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs text-foreground/48"><span className="flex items-center gap-1.5"><Check size={13} className="text-success" /> Role-aware access</span><span className="flex items-center gap-1.5"><Check size={13} className="text-success" /> Evidence provenance</span><span className="flex items-center gap-1.5"><Check size={13} className="text-success" /> Human review remains in control</span></div>
          </div>

          <div className="relative">
            <div className="absolute -inset-12 bg-[radial-gradient(circle,var(--color-primary),transparent_62%)] opacity-10 blur-3xl" />
            <div className="glass-panel relative overflow-hidden rounded-[2rem] p-4 shadow-2xl sm:p-6">
              <div className="flex items-center justify-between border-b border-border/70 pb-4"><div><div className="text-[10px] uppercase tracking-[.2em] text-primary">Research mission</div><div className="mt-1 font-heading text-lg">Reliable clinical AI under uncertainty</div></div><span className="rounded-full border border-success/30 bg-success/10 px-2 py-1 text-[10px] text-success">Evidence scoped</span></div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-border bg-panel/80 p-4"><FileSearch className="text-primary" size={20} /><div className="mt-6 text-3xl font-heading">128</div><div className="text-xs text-foreground/45">papers mapped</div></div>
                <div className="rounded-2xl border border-border bg-panel/80 p-4"><LibraryBig className="text-secondary" size={20} /><div className="mt-6 text-3xl font-heading">5</div><div className="text-xs text-foreground/45">academic sources</div></div>
              </div>
              <div className="mt-3 rounded-2xl border border-border bg-panel/80 p-4"><div className="mb-3 flex items-center justify-between text-xs"><span className="text-foreground/55">Research pipeline</span><span className="text-primary">Analyzing literature</span></div><div className="h-2 overflow-hidden rounded-full bg-border/50"><div className="scanline h-full w-[58%] rounded-full bg-primary" /></div><div className="mt-4 grid grid-cols-4 gap-2 text-center text-[9px] text-foreground/45">{PIPELINE.slice(0, 4).map((stage, index) => <div key={stage} className={index < 3 ? "text-primary" : ""}>{stage}</div>)}</div></div>
              <div className="mt-3 rounded-2xl border border-primary/20 bg-primary/5 p-4"><div className="flex gap-3"><ClipboardCheck size={18} className="mt-0.5 shrink-0 text-primary" /><div><div className="text-sm font-medium">Traceable research decisions</div><p className="mt-1 text-xs leading-relaxed text-foreground/50">Every major output keeps its evidence scope, source records and required human checks visible.</p></div></div></div>
            </div>
          </div>
        </section>

        <section id="features" className="border-y border-border/70 bg-panel/25 py-24">
          <div className="mx-auto max-w-7xl px-5 sm:px-8"><SectionHeading eyebrow="One connected workspace" title="The full research journey, without fragmented tools" body="Move from discovery to writing while keeping project context, evidence and collaboration connected." /><div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{FEATURES.map(({ icon: Icon, title, body }) => <article key={title} className="glass-soft rounded-3xl p-6 transition-transform duration-200 hover:-translate-y-1"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon size={21} /></span><h3 className="mt-5 font-heading text-xl">{title}</h3><p className="mt-2 text-sm leading-relaxed text-foreground/55">{body}</p></article>)}</div></div>
        </section>

        <section id="roles" className="mx-auto max-w-7xl px-5 py-24 sm:px-8"><SectionHeading eyebrow="Built around real research roles" title="One platform, the right workspace for every user" body="Students and research assistants can start immediately. Professor and Lab Admin accounts receive verified access to privileged workflows." /><div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{ROLES.map(({ icon: Icon, title, body }) => <article key={title} className="rounded-3xl border border-border bg-panel/55 p-6"><Icon className="text-secondary" size={24} /><h3 className="mt-6 font-heading text-xl">{title}</h3><p className="mt-2 text-sm leading-relaxed text-foreground/55">{body}</p></article>)}</div></section>

        <section id="workflow" className="border-y border-border/70 bg-panel/25 py-24"><div className="mx-auto max-w-7xl px-5 sm:px-8"><SectionHeading eyebrow="Autonomous pipeline, accountable researcher" title="A clear path from question to proposal" body="NOVA accelerates the repetitive work while keeping interpretation, validation and final decisions with the researcher." /><ol className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-7">{PIPELINE.map((stage, index) => <li key={stage} className="relative rounded-2xl border border-border bg-background/70 p-4"><span className="font-mono text-[10px] text-primary">0{index + 1}</span><div className="mt-8 font-medium">{stage}</div>{index < PIPELINE.length - 1 ? <ChevronRight size={15} className="absolute -right-2.5 top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-background text-primary lg:block" /> : null}</li>)}</ol></div></section>

        <section id="pricing" className="mx-auto max-w-7xl px-5 py-24 sm:px-8"><SectionHeading eyebrow="Beta pricing" title="Start individually. Scale when your research team is ready." body="These packages define the planned commercial model. Billing activation will be added after the beta; the Owner Admin can edit prices and features at any time." /><div className="mt-12 grid gap-5 lg:grid-cols-4">{plans.map((plan) => { const price = formatMonthlyPrice(plan); return <article key={plan.id} className={`relative flex flex-col rounded-3xl border p-6 ${plan.is_featured ? "border-primary bg-primary/7 shadow-[0_0_40px_-20px_var(--color-primary)]" : "border-border bg-panel/55"}`}>{plan.is_featured ? <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-on-primary">Most popular</span> : null}<div className="text-xs text-foreground/45">{plan.audience}</div><h3 className="mt-2 font-heading text-2xl">{plan.name}</h3><div className="mt-5"><span className="font-heading text-3xl">{price.value}</span><span className="ml-1 text-xs text-foreground/45">{price.suffix}</span></div>{plan.yearly_price_pkr != null && plan.yearly_price_pkr > 0 ? <div className="mt-1 text-xs text-foreground/40">PKR {plan.yearly_price_pkr.toLocaleString()} billed yearly</div> : null}<p className="mt-5 min-h-16 text-sm leading-relaxed text-foreground/55">{plan.description}</p><ul className="mt-5 flex-1 space-y-3">{plan.features.map((feature) => <li key={feature} className="flex gap-2 text-sm text-foreground/68"><Check size={15} className="mt-0.5 shrink-0 text-success" />{feature}</li>)}</ul><Link to={`/auth?mode=signup&plan=${encodeURIComponent(plan.id)}`} className={`mt-7 rounded-xl px-4 py-2.5 text-center text-sm font-semibold ${plan.is_featured ? "bg-primary text-on-primary" : "border border-border bg-background/50 text-foreground hover:border-primary/50"}`}>{plan.cta_label}</Link></article>; })}</div></section>

        <section className="px-5 pb-24 sm:px-8"><div className="mx-auto max-w-5xl overflow-hidden rounded-[2rem] border border-primary/25 bg-[linear-gradient(135deg,oklch(0.25_0.08_210/.6),oklch(0.18_0.04_285/.6))] p-8 text-center sm:p-14"><Sparkles className="mx-auto text-primary" /><h2 className="mt-5 font-heading text-4xl">Build stronger research with a visible evidence trail.</h2><p className="mx-auto mt-4 max-w-2xl text-foreground/60">Create your workspace, choose your professional role and begin a structured research project today.</p><div className="mt-7 flex flex-wrap justify-center gap-3"><Link to="/auth?mode=signup" className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 font-semibold text-on-primary">Get started <ArrowRight size={17} /></Link><Link to="/auth" className="rounded-xl border border-border bg-background/40 px-6 py-3 font-semibold">Login</Link></div></div></section>
      </main>

      <footer className="border-t border-border bg-panel/30"><div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-8 text-xs text-foreground/40 sm:px-8 md:flex-row md:items-center md:justify-between"><div>© {new Date().getFullYear()} NOVA Research Studio</div><div>AI decision support for research — final academic responsibility remains with the researcher.</div></div></footer>
    </div>
  );
}

function SectionHeading({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return <div className="max-w-3xl"><div className="text-xs font-semibold uppercase tracking-[.2em] text-primary">{eyebrow}</div><h2 className="mt-3 font-heading text-4xl font-semibold leading-tight sm:text-5xl">{title}</h2><p className="mt-4 text-base leading-relaxed text-foreground/55">{body}</p></div>;
}
