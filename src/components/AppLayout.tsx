import { ReactNode, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { getAvatarUrl } from "@/lib/avatar";
import {
  LayoutDashboard,
  ClipboardList,
  Gift,
  Settings,
  LogOut,
  Menu,
  X,
  Handshake,
  Users,
  Coins,
  CalendarDays,
  CheckCircle2,
  Eye,
  ShoppingBag,
  FileText,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";

const responsavelMainLinks = [
  { to: "/responsavel", label: "Dashboard", icon: LayoutDashboard },
  { to: "/responsavel/atribuicao", label: "Calendário", icon: CalendarDays },
  { to: "/responsavel/aprovacoes", label: "Aprovações", icon: CheckCircle2 },
  { to: "/responsavel/resgates", label: "Resgates", icon: ShoppingBag },
  { to: "/responsavel/acompanhar", label: "Acompanhar", icon: Eye },
  { to: "/responsavel/moedas-filhos", label: "Moedas", icon: Coins },
  { to: "/responsavel/deveres", label: "Deveres", icon: Shield },
];

const responsavelConfigLinks = [
  { to: "/responsavel/membros", label: "Membros", icon: Users },
  { to: "/responsavel/tarefas", label: "Tarefas", icon: ClipboardList },
  { to: "/responsavel/recompensas", label: "Recompensas", icon: Gift },
  { to: "/responsavel/contrato", label: "Contrato", icon: FileText },
  { to: "/responsavel/config", label: "Configurações", icon: Settings },
];

const criancaLinks = [
  { to: "/crianca", label: "Dashboard", icon: LayoutDashboard },
  { to: "/crianca/deveres", label: "Deveres", icon: Shield },
  { to: "/crianca/tarefas", label: "Minhas Tarefas", icon: ClipboardList },
  { to: "/crianca/loja", label: "Loja", icon: Gift },
  { to: "/crianca/resgates", label: "Meus Resgates", icon: ShoppingBag },
  { to: "/crianca/moedas", label: "Minhas Moedas", icon: Coins },
  { to: "/crianca/contrato", label: "Contrato", icon: FileText },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const { role, profile, signOut } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const mainLinks = role === "responsavel" ? responsavelMainLinks : criancaLinks;
  const configLinks = role === "responsavel" ? responsavelConfigLinks : [];

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Mobile header */}
      <header className="flex items-center justify-between border-b bg-card p-4 md:hidden">
        <Link to={role === "responsavel" ? "/responsavel" : "/crianca"} className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Handshake className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-display text-lg font-bold">Nosso Pacto</span>
        </Link>
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
                <Handshake className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="font-display text-lg font-bold">Nosso Pacto</span>
            </div>
            <div className="space-y-1">
              {mainLinks.map((link) => (
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
              {configLinks.length > 0 && (
                <>
                  <div className="my-2 border-t border-border" />
                  {configLinks.map((link) => (
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
                </>
              )}
            </div>
            <div className="absolute bottom-4 left-4 right-4">
              <div className="mb-3 rounded-lg bg-muted p-3 flex items-center gap-2">
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarImage src={getAvatarUrl(profile?.foto_url ?? null) ?? undefined} alt={profile?.nome} />
                  <AvatarFallback className="bg-primary/10 text-xs">{role === "responsavel" ? "👨‍💼" : "👧"}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">
                    {role === "responsavel" ? "Responsável" : "Criança"}
                  </p>
                  <p className="truncate text-sm font-semibold">{profile?.nome}</p>
                </div>
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
              <Handshake className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-display text-lg font-bold">Nosso Pacto</span>
          </div>
          <nav className="flex-1 space-y-1">
            {mainLinks.map((link) => (
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
            {configLinks.length > 0 && (
              <>
                <div className="my-2 border-t border-border" />
                {configLinks.map((link) => (
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
              </>
            )}
          </nav>
          <div>
            <div className="mb-3 rounded-lg bg-muted p-3 flex items-center gap-2">
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarImage src={getAvatarUrl(profile?.foto_url ?? null) ?? undefined} alt={profile?.nome} />
                <AvatarFallback className="bg-primary/10 text-xs">{role === "responsavel" ? "👨‍💼" : "👧"}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">
                  {role === "responsavel" ? "Responsável" : "Criança"}
                </p>
                <p className="truncate text-sm font-semibold">{profile?.nome}</p>
              </div>
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
