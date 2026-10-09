import { ExternalLink, LogOut, ShieldCheck, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Button } from "./ui";

export function OwnerPortalShell({ children }: { children: React.ReactNode }) {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const mainAppUrl = import.meta.env.VITE_MAIN_APP_URL || "https://nova-research-scientist.vercel.app";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-10">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-on-primary"><Sparkles size={18} /></span>
            <div><div className="font-heading text-lg font-semibold">NOVA Owner Control</div><div className="flex items-center gap-1 text-[10px] uppercase tracking-[0.16em] text-success"><ShieldCheck size={11} />Private administration portal</div></div>
          </div>
          <div className="flex items-center gap-2">
            <a href={mainAppUrl} className="hidden items-center gap-1 rounded-lg px-3 py-2 text-xs text-foreground/55 hover:bg-panel hover:text-foreground sm:flex">Public website <ExternalLink size={13} /></a>
            <Button variant="secondary" size="sm" onClick={async () => { await signOut(); navigate("/auth", { replace: true }); }}><LogOut size={14} />Sign out</Button>
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
