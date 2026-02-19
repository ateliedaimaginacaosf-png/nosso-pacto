import { createContext, useContext, useEffect, useState, useRef, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Profile = Tables<"profiles">;
type AppRole = "responsavel" | "crianca";

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
  const initialized = useRef(false);

  const fetchProfile = async (userId: string) => {
    try {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();

      setProfile(profileData);
      setRole(roleData?.role ?? null);

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
    // 1. Set up listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        // Skip events until initial load is done
        if (!initialized.current) return;

        setSession(newSession);
        setUser(newSession?.user ?? null);

        if (newSession?.user) {
          await fetchProfile(newSession.user.id);
        } else {
          clearState();
        }
        setLoading(false);
      }
    );

    // 2. Then get the initial session
    supabase.auth.getSession().then(async ({ data: { session: initialSession } }) => {
      setSession(initialSession);
      setUser(initialSession?.user ?? null);

      if (initialSession?.user) {
        await fetchProfile(initialSession.user.id);
      }

      initialized.current = true;
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    clearState();
  };

  return (
    <AuthContext.Provider value={{ session, user, profile, role, familiaAtiva, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
