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
import type { ProfessionalRole, ProfessionalRoleRequest, Profile } from "../lib/types";

type AuthResult = { error: string | null };

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  roleRequest: ProfessionalRoleRequest | null;
  isOwnerAdmin: boolean;
  loading: boolean;
  passwordRecovery: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    role: ProfessionalRole,
    institution: string,
    requestedPlan: string,
  ) => Promise<AuthResult>;
  resendConfirmation: (email: string) => Promise<AuthResult>;
  requestPasswordReset: (email: string) => Promise<AuthResult>;
  updatePassword: (password: string) => Promise<AuthResult>;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roleRequest, setRoleRequest] = useState<ProfessionalRoleRequest | null>(null);
  const [isOwnerAdmin, setIsOwnerAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  const refreshProfile = useCallback(async (uid: string) => {
    const [profileResult, requestResult, adminResult] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
      supabase.from("professional_role_requests").select("*").eq("profile_id", uid).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("platform_admins").select("user_id").eq("user_id", uid).maybeSingle(),
    ]);
    setProfile((profileResult.data as Profile | null) ?? null);
    setRoleRequest((requestResult.data as ProfessionalRoleRequest | null) ?? null);
    setIsOwnerAdmin(Boolean(adminResult.data));
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) await refreshProfile(data.session.user.id);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
      if (s?.user) {
        setLoading(true);
        void refreshProfile(s.user.id).finally(() => setLoading(false));
      }
      else {
        setProfile(null);
        setRoleRequest(null);
        setIsOwnerAdmin(false);
        setLoading(false);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [refreshProfile]);

  const signIn = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error: friendlyAuthError(error.message) };
      setPasswordRecovery(false);
      return { error: null };
    },
    [],
  );

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      fullName: string,
      role: ProfessionalRole,
      institution: string,
      requestedPlan: string,
    ): Promise<AuthResult> => {
      const selfAssignableRole = role === "student" || role === "research_assistant" ? role : "student";
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            role: selfAssignableRole,
            requested_role: role,
            institution,
            requested_plan: requestedPlan,
          },
          emailRedirectTo: `${window.location.origin}/dashboard`,
        },
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

  const resendConfirmation = useCallback(async (email: string): Promise<AuthResult> => {
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/dashboard` },
    });
    return { error: error ? friendlyAuthError(error.message) : null };
  }, []);

  const requestPasswordReset = useCallback(async (email: string): Promise<AuthResult> => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth?recovery=1`,
    });
    return { error: error ? friendlyAuthError(error.message) : null };
  }, []);

  const updatePassword = useCallback(async (password: string): Promise<AuthResult> => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { error: friendlyAuthError(error.message) };
    setPasswordRecovery(false);
    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const refreshCurrentProfile = useCallback(async () => {
    if (user?.id) await refreshProfile(user.id);
  }, [refreshProfile, user?.id]);

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        roleRequest,
        isOwnerAdmin,
        loading,
        passwordRecovery,
        signIn,
        signUp,
        resendConfirmation,
        requestPasswordReset,
        updatePassword,
        signOut,
        refreshProfile: refreshCurrentProfile,
      }}
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
    return "Your password needs to be at least 8 characters.";
  }
  if (m.includes("rate limit")) {
    return "Too many attempts — wait a moment and try again.";
  }
  if (m.includes("not confirmed")) {
    return "This email hasn't been confirmed yet. Check your inbox for the confirmation link, then sign in.";
  }
  return "We couldn't do that just now. Please try again.";
}
