import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Profile = Tables<"profiles">;
type AppRole = "responsavel" | "crianca" | "admin";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: AppRole | null;
  familiaAtiva: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  role: null,
  familiaAtiva: false,
  loading: true,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [familiaAtiva, setFamiliaAtiva] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    try {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      const { data: rolesData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);

      setProfile(profileData);

      const roles = (rolesData || []).map((r: any) => r.role);
      const resolvedRole = roles.includes("admin")
        ? "admin"
        : roles.includes("responsavel")
        ? "responsavel"
        : roles.includes("crianca")
        ? "crianca"
        : null;
      setRole(resolvedRole);

      if (profileData?.familia_id) {
        const { data: familiaData } = await supabase
          .from("familia")
          .select("ativo")
          .eq("id", profileData.familia_id)
          .maybeSingle();
        setFamiliaAtiva(familiaData?.ativo ?? false);
      } else {
        setFamiliaAtiva(false);
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
      setProfile(null);
      setRole(null);
      setFamiliaAtiva(false);
    }
  };

  const clearState = () => {
    setProfile(null);
    setRole(null);
    setFamiliaAtiva(false);
  };

  useEffect(() => {
    // onAuthStateChange é a ÚNICA fonte de verdade.
    // O Supabase dispara INITIAL_SESSION automaticamente na inicialização.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);

        if (newSession?.user) {
          await fetchProfile(newSession.user.id);
        } else {
          clearState();
        }

        setLoading(false); // ← sempre desliga o loading, em qualquer cenário
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    setSession(null);
    setUser(null);
    clearState();
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <AuthContext.Provider value={{ session, user, profile, role, familiaAtiva, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
