import { createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode } from "react";
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
  const mountedRef = useRef(true);

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const [{ data: profileData }, { data: rolesData }] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId),
      ]);

      if (!mountedRef.current) return;

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
        if (!mountedRef.current) return;
        setFamiliaAtiva(familiaData?.ativo ?? false);
      } else {
        setFamiliaAtiva(false);
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
      if (!mountedRef.current) return;
      setProfile(null);
      setRole(null);
      setFamiliaAtiva(false);
    }
  }, []);

  const clearState = () => {
    setProfile(null);
    setRole(null);
    setFamiliaAtiva(false);
  };

  useEffect(() => {
    mountedRef.current = true;

    // Busca sessão existente primeiro, depois escuta mudanças
    const initialize = async () => {
      try {
        const { data: { session: existingSession } } = await supabase.auth.getSession();
        if (!mountedRef.current) return;

        setSession(existingSession);
        setUser(existingSession?.user ?? null);

        if (existingSession?.user) {
          await fetchProfile(existingSession.user.id);
        } else {
          clearState();
        }
      } catch (error) {
        console.error("Error initializing auth:", error);
        clearState();
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    };

    initialize();

    // Escuta mudanças APÓS inicialização (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        // Atualiza sessão imediatamente
        setSession(newSession);
        setUser(newSession?.user ?? null);

        if (newSession?.user) {
          // Apenas mostra loading em login real, não em token refresh
          // Token refresh acontece ao voltar à aba — setar loading desmontaria formulários abertos
          const isHardAuthChange = event === "SIGNED_IN" || event === "USER_UPDATED";
          if (isHardAuthChange) setLoading(true);

          // Defer para não bloquear o Supabase client
          setTimeout(() => {
            fetchProfile(newSession.user.id).finally(() => {
              if (mountedRef.current && isHardAuthChange) setLoading(false);
            });
          }, 0);
        } else {
          clearState();
          setLoading(false);
        }
      }
    );

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

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
