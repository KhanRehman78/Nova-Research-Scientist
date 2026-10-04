import { useCallback, useEffect, useState } from "react";
import { Users, UserPlus, Shield, GraduationCap } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { ROLE_LABEL } from "../lib/constants";
import { initials } from "../lib/format";
import type { Profile } from "../lib/types";
import { Button, Chip, Spinner } from "./ui";

interface Member {
  id: string;
  full_name: string;
  role: string;
  isOwner: boolean;
}

const ROLE_OPTIONS = ["student", "research_assistant", "professor"] as const;

export function TeamPanel({ projectId }: { projectId: string | null }) {
  const { user } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("student");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!projectId) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data: proj } = await supabase
        .from("projects")
        .select("owner_id")
        .eq("id", projectId)
        .maybeSingle();
      const ownerId = (proj as { owner_id: string } | null)?.owner_id;

      const { data: mrows } = await supabase
        .from("project_members")
        .select("profile_id, role")
        .eq("project_id", projectId);

      const ids = [...new Set([ownerId, ...((mrows ?? []) as { profile_id: string }[]).map((m) => m.profile_id)].filter(Boolean))];
      const profiles = new Map<string, Profile>();
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name, role")
          .in("id", ids as string[]);
        ((profs ?? []) as Profile[]).forEach((p) => profiles.set(p.id, p));
      }

      const list: Member[] = [];
      if (ownerId) {
        const owner = profiles.get(ownerId);
        list.push({ id: ownerId, full_name: owner?.full_name || "Project owner", role: owner?.role || "professor", isOwner: true });
      }
      ((mrows ?? []) as { profile_id: string; role: string }[]).forEach((m) => {
        if (m.profile_id === ownerId) return;
        const p = profiles.get(m.profile_id);
        list.push({ id: m.profile_id, full_name: p?.full_name || "Member", role: m.role || "student", isOwner: false });
      });
      setMembers(list);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const invite = async () => {
    if (!projectId || !email.trim() || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const { data, error } = await supabase.functions.invoke("invite-member", {
        body: { project_id: projectId, email: email.trim(), role },
      });
      if (error || !data?.ok) {
        const d = data as { error?: string } | null;
        throw new Error(d?.error ?? error?.message ?? "Invite failed");
      }
      setMsg({
        tone: "ok",
        text: data.invitation_sent
          ? `Invitation sent to ${email.trim()}; project access will be ready when they accept.`
          : `${email.trim()} added as ${ROLE_LABEL[role] ?? role}.`,
      });
      setEmail("");
      await load();
    } catch (e) {
      setMsg({ tone: "err", text: (e as Error).message || "Couldn't send the invite." });
    } finally {
      setBusy(false);
    }
  };

  const isOwner = members.find((m) => m.isOwner)?.id === user?.id;

  return (
    <section aria-label="Team and access" className="glass-soft rounded-3xl p-6">
      <div className="mb-4 flex items-center gap-2 font-heading text-lg text-foreground">
        <Users size={18} className="text-secondary" aria-hidden="true" /> Team &amp; access
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-foreground/50">
          <Spinner size={14} className="text-primary" /> Loading members…
        </div>
      ) : members.length === 0 ? (
        <p className="text-sm text-foreground/55">No members yet — invite a colleague to collaborate.</p>
      ) : (
        <ul className="space-y-2">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 rounded-xl border border-border bg-panel px-3 py-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary/20 text-xs font-semibold text-secondary">
                {initials(m.full_name)}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                {m.full_name}
                {m.isOwner ? <span className="ml-1 text-xs text-foreground/40">(owner)</span> : null}
              </span>
              <Chip tone={m.isOwner ? "violet" : "default"}>{ROLE_LABEL[m.role] ?? m.role}</Chip>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-5 border-t border-border pt-4">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-widest text-foreground/50">
          <UserPlus size={13} aria-hidden="true" /> Invite by email
        </div>
        {!isOwner ? (
          <p className="text-xs text-foreground/45">Only the project owner can invite members.</p>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@university.edu"
              aria-label="Email to invite"
              className="min-w-0 flex-1 rounded-xl border border-border bg-panel px-3 py-2 text-sm text-foreground placeholder:text-foreground/35 focus:border-primary focus:outline-2 focus:outline-primary/50"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              aria-label="Role for invite"
              className="cursor-pointer rounded-xl border border-border bg-panel px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-2 focus:outline-primary/50"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>{ROLE_LABEL[r]}</option>
              ))}
            </select>
            <Button size="sm" onClick={invite} disabled={busy || !email.trim()}>
              {busy ? <Spinner size={13} /> : <GraduationCap size={13} />}
              Invite
            </Button>
          </div>
        )}
        {msg ? (
          <div
            role={msg.tone === "err" ? "alert" : "status"}
            className={`mt-2 flex items-center gap-1.5 text-xs ${msg.tone === "err" ? "text-destructive" : "text-success"}`}
          >
            <Shield size={12} aria-hidden="true" /> {msg.text}
          </div>
        ) : null}
      </div>
    </section>
  );
}
