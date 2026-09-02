import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { ProfessionalRole, Profile } from "../lib/types";

type AuthResult = { error: string | null };

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    role: Exclude<ProfessionalRole, "lab_admin">,
  ) => Promise<AuthResult>;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = useCallback(async (uid: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", uid)
      .maybeSingle();
    setProfile((data as Profile | null) ?? null);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) refreshProfile(data.session.user.id);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) refreshProfile(s.user.id);
      else setProfile(null);
    });
    return () => sub.subscription.unsubscribe();
  }, [refreshProfile]);

  const signIn = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error: friendlyAuthError(error.message) };
      return { error: null };
    },
    [],
  );

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      fullName: string,
      role: Exclude<ProfessionalRole, "lab_admin">,
    ): Promise<AuthResult> => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName, role }, emailRedirectTo: `${window.location.origin}/` },
      });
      if (error) return { error: friendlyAuthError(error.message) };
      if (data.user) {
        refreshProfile(data.user.id);
      }
      if (data.session) return { error: null };
      // Email confirmation flow — no session yet.
      return { error: "confirm" };
    },
    [refreshProfile],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const refreshCurrentProfile = useCallback(async () => {
    if (user?.id) await refreshProfile(user.id);
  }, [refreshProfile, user?.id]);

  return (
    <AuthContext.Provider
      value={{ session, user, profile, loading, signIn, signUp, signOut, refreshProfile: refreshCurrentProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

function friendlyAuthError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials")) {
    return "That email and password don't match. Double-check and try again.";
  }
  if (m.includes("already registered")) {
    return "An account with that email already exists — try signing in instead.";
  }
  if (m.includes("password should be at least")) {
    return "Your password needs to be at least 6 characters.";
  }
  if (m.includes("rate limit")) {
    return "Too many attempts — wait a moment and try again.";
  }
  if (m.includes("not confirmed")) {
    return "This email hasn't been confirmed yet. Check your inbox for the confirmation link, then sign in.";
  }
  return "We couldn't do that just now. Please try again.";
}
