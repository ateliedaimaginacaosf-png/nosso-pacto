import { ReactNode, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  ClipboardList,
  Gift,
  Settings,
  LogOut,
  Menu,
  X,
  Sparkles,
  Users,
  Coins,
  CalendarDays,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const responsavelLinks = [
  { to: "/responsavel", label: "Dashboard", icon: LayoutDashboard },
  { to: "/responsavel/tarefas", label: "Tarefas", icon: ClipboardList },
  { to: "/responsavel/atribuicao", label: "Calendário", icon: CalendarDays },
  { to: "/responsavel/aprovacoes", label: "Aprovações", icon: CheckCircle2 },
  { to: "/responsavel/recompensas", label: "Recompensas", icon: Gift },
  { to: "/responsavel/membros", label: "Membros", icon: Users },
  { to: "/responsavel/config", label: "Configurações", icon: Settings },
];

const criancaLinks = [
  { to: "/crianca", label: "Dashboard", icon: LayoutDashboard },
  { to: "/crianca/tarefas", label: "Tarefas do Dia", icon: ClipboardList },
  { to: "/crianca/loja", label: "Loja", icon: Gift },
  { to: "/crianca/moedas", label: "Minhas Moedas", icon: Coins },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const { role, profile, signOut } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const links = role === "responsavel" ? responsavelLinks : criancaLinks;

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Mobile header */}
      <header className="flex items-center justify-between border-b bg-card p-4 md:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-display text-lg font-bold">Autonomy</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </header>

      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm md:hidden" onClick={() => setMobileMenuOpen(false)}>
          <nav
            className="absolute left-0 top-0 h-full w-64 border-r bg-card p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-6 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <Sparkles className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="font-display text-lg font-bold">Autonomy</span>
            </div>
            <div className="space-y-1">
              {links.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    location.pathname === link.to
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <link.icon className="h-4 w-4" />
                  {link.label}
                </Link>
              ))}
            </div>
            <div className="absolute bottom-4 left-4 right-4">
              <div className="mb-3 rounded-lg bg-muted p-3">
                <p className="text-xs font-medium text-muted-foreground">
                  {role === "responsavel" ? "Responsável" : "Criança"}
                </p>
                <p className="truncate text-sm font-semibold">{profile?.nome}</p>
              </div>
              <Button variant="ghost" className="w-full justify-start gap-2" onClick={signOut}>
                <LogOut className="h-4 w-4" /> Sair
              </Button>
            </div>
          </nav>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden w-64 flex-shrink-0 border-r bg-card md:block">
        <div className="flex h-full flex-col p-4">
          <div className="mb-6 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-display text-lg font-bold">Autonomy</span>
          </div>
          <nav className="flex-1 space-y-1">
            {links.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  location.pathname === link.to
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <link.icon className="h-4 w-4" />
                {link.label}
              </Link>
            ))}
          </nav>
          <div>
            <div className="mb-3 rounded-lg bg-muted p-3">
              <p className="text-xs font-medium text-muted-foreground">
                {role === "responsavel" ? "Responsável" : "Criança"}
              </p>
              <p className="truncate text-sm font-semibold">{profile?.nome}</p>
            </div>
            <Button variant="ghost" className="w-full justify-start gap-2" onClick={signOut}>
              <LogOut className="h-4 w-4" /> Sair
            </Button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
        {children}
      </main>
    </div>
  );
}
