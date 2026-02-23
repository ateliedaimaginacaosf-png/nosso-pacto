import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: "responsavel" | "crianca";
}

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { session, role, familiaAtiva, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (!familiaAtiva) {
    return <Navigate to="/acesso-pendente" replace />;
  }

  if (requiredRole && role !== requiredRole && role !== "admin") {
    const redirect = role === "responsavel" ? "/responsavel" : "/crianca";
    return <Navigate to={redirect} replace />;
  }

  return <>{children}</>;
}
