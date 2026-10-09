import type { PricingPlan } from "./types";

export const DEFAULT_PRICING_PLANS: PricingPlan[] = [
  { id: "starter", name: "Starter", audience: "Students exploring research", description: "Start a structured research workflow and test NOVA on individual projects.", monthly_price_pkr: 0, yearly_price_pkr: 0, features: ["Quick research workflow", "Saved research projects", "Literature and gap workspace", "Basic report generation"], cta_label: "Start free", is_featured: false, is_active: true, sort_order: 10 },
  { id: "researcher-pro", name: "Researcher Pro", audience: "Postgraduate researchers and assistants", description: "Deeper evidence workflows, professional agents and writing support for active researchers.", monthly_price_pkr: 2999, yearly_price_pkr: 29990, features: ["Deep and Expert research modes", "Writing Studio and readiness checks", "Professional research agents", "Priority project capacity"], cta_label: "Choose Researcher Pro", is_featured: true, is_active: true, sort_order: 20 },
  { id: "lab", name: "Lab & Supervisor", audience: "Professors and research laboratories", description: "Supervision, collaboration and lab intelligence for research teams.", monthly_price_pkr: 9999, yearly_price_pkr: 99990, features: ["Professor and lab workflows", "Student supervision records", "Team collaboration and analytics", "Grant and peer-review tools"], cta_label: "Start lab workspace", is_featured: false, is_active: true, sort_order: 30 },
  { id: "institution", name: "Institution", audience: "Universities and research organizations", description: "Custom onboarding, governance and capacity for institution-wide deployment.", monthly_price_pkr: null, yearly_price_pkr: null, features: ["Custom user and project capacity", "Institutional onboarding", "Governance and deployment planning", "Priority support"], cta_label: "Contact for pricing", is_featured: false, is_active: true, sort_order: 40 },
];

export function formatMonthlyPrice(plan: PricingPlan): { value: string; suffix: string } {
  if (plan.monthly_price_pkr == null) return { value: "Custom", suffix: "Talk to us" };
  if (plan.monthly_price_pkr === 0) return { value: "Free", suffix: "No card required" };
  return { value: `PKR ${plan.monthly_price_pkr.toLocaleString()}`, suffix: "/ month" };
}
