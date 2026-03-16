import { lazy, Suspense } from "react";
import { RouteErrorBoundary } from "@/components/ErrorBoundary";
import { useAuth } from "@/contexts/AuthContext";
import { SelectedChildProvider } from "@/contexts/SelectedChildContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, CalendarDays, Coins, Gift, FileText, ClipboardCheck, Loader2, DollarSign } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { OnboardingGuide } from "@/components/OnboardingGuide";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { Link, Navigate, useLocation } from "react-router-dom";
import { PersistentViewStack } from "@/components/PersistentViewStack";

// Lazy load sub-pages
const AtribuirTarefas = lazy(() => import("./responsavel/AtribuirTarefas"));
const Configuracoes = lazy(() => import("./responsavel/Configuracoes"));

const AprovacoesPendentes = lazy(() => import("./responsavel/AprovacoesPendentes"));
const AcompanharTarefas = lazy(() => import("./responsavel/AcompanharTarefas"));
const HistoricoMoedasFilhos = lazy(() => import("./responsavel/HistoricoMoedasFilhos"));
const GerenciarResgates = lazy(() => import("./responsavel/GerenciarResgates"));
const ContratoAutonomia = lazy(() => import("./responsavel/ContratoAutonomia"));
const RegrasOuroFilhos = lazy(() => import("./responsavel/RegrasOuroFilhos"));
const CompromissosFilhos = lazy(() => import("./responsavel/CompromissosFilhos"));
const MesadaFilhos = lazy(() => import("./responsavel/MesadaFilhos"));

const SubPageLoader = () => (
  <AppLayout>
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  </AppLayout>
);

function DashboardHome() {
  const { profile } = useAuth();

  // Realtime: auto-refresh when data changes
  useRealtimeSubscription(
    ["tarefa", "resgate_recompensa", "transacao", "notificacao", "profiles"],
    [
      ["responsavel-stats"],
      ["tarefas-familia"],
      ["resgates-pendentes"],
    ]
  );

  const { data: stats } = useQuery({
    queryKey: ["responsavel-stats", profile?.familia_id],
    queryFn: async () => {
      const [pendentes, membrosRes, criancasRes, resgatesPend, cancelPend, revisoesPend, contratosRejeitados, contratosNewer] = await Promise.all([
        supabase.from("tarefa").select("id", { count: "exact", head: true }).eq("familia_id", profile!.familia_id).in("status", ["pendente_aprovacao", "dispensa_solicitada"]),
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("familia_id", profile!.familia_id),
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("familia_id", profile!.familia_id).eq("tipo_perfil", "crianca"),
        supabase.from("resgate_recompensa").select("id", { count: "exact", head: true }).eq("familia_id", profile!.familia_id).eq("status", "pendente"),
        supabase.from("resgate_recompensa").select("id", { count: "exact", head: true }).eq("familia_id", profile!.familia_id).eq("status", "cancelamento_solicitado"),
        supabase.from("contrato_revisao").select("id", { count: "exact", head: true }).eq("familia_id", profile!.familia_id).eq("status", "pendente"),
        supabase.from("contrato_versao").select("id, crianca_id, versao, status").eq("familia_id", profile!.familia_id).eq("status", "rejeitado"),
        supabase.from("contrato_versao").select("crianca_id, versao, status").eq("familia_id", profile!.familia_id).in("status", ["rascunho", "pendente_aprovacao", "vigente"]),
      ]);

      const rejeitados = contratosRejeitados.data ?? [];
      const newer = contratosNewer.data ?? [];
      const rejeitadosPendentes = rejeitados.filter((r) => !newer.some((n) => n.crianca_id === r.crianca_id && n.versao > r.versao)).length;

      return {
        tarefasPendentes: pendentes.count ?? 0,
        membros: membrosRes.count ?? 0,
        criancas: criancasRes.count ?? 0,
        resgatesPendentes: (resgatesPend.count ?? 0) + (cancelPend.count ?? 0),
        contratosNotificacoes: (revisoesPend.count ?? 0) + rejeitadosPendentes,
      };
    },
    enabled: !!profile,
  });

  // Check if any child has mesada active
  const { data: hasChildWithMesada } = useQuery({
    queryKey: ["has-child-mesada", profile?.familia_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("configuracao_familia")
        .select("usar_mesada")
        .eq("familia_id", profile!.familia_id);
      return (data ?? []).some((c: any) => c.usar_mesada === true);
    },
    enabled: !!profile,
  });

  return (
    <AppLayout>
      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-display text-2xl font-bold md:text-3xl">
            Olá, {profile?.nome}! 👋
          </h1>
          <p className="text-muted-foreground">Painel do Nosso Pacto</p>
        </motion.div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Onboarding Guide */}
          <div className="sm:col-span-2 lg:col-span-3">
            <OnboardingGuide />
          </div>
          {/* Calendário */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Link to="/responsavel/atribuicao" className="block">
              <Card className="border-2 border-blue-500/20 transition-shadow hover:shadow-md">
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
                    <CalendarDays className="h-5 w-5 text-blue-600" />
                  </div>
                  <CardTitle className="font-display text-lg">Calendário</CardTitle>
                  {(stats?.tarefasPendentes ?? 0) > 0 && (
                    <Badge variant="destructive" className="ml-auto">{stats!.tarefasPendentes}</Badge>
                  )}
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {stats?.tarefasPendentes ? `${stats.tarefasPendentes} em validação/dispensa` : "Gerencie tarefas no calendário"}
                  </p>
                </CardContent>
              </Card>
            </Link>
          </motion.div>

          {/* Aprovações */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
            <Link to={`/responsavel/atribuicao?status=pendente_aprovacao,dispensa_solicitada${(stats?.criancas ?? 0) === 1 ? "&auto_child=1" : ""}`} className="block">
              <Card className="border-2 border-yellow-500/20 transition-shadow hover:shadow-md">
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-yellow-500/10">
                    <ClipboardCheck className="h-5 w-5 text-yellow-600" />
                  </div>
                  <CardTitle className="font-display text-lg">Aprovações</CardTitle>
                  {(stats?.tarefasPendentes ?? 0) > 0 && (
                    <Badge variant="destructive" className="ml-auto">{stats!.tarefasPendentes}</Badge>
                  )}
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {stats?.tarefasPendentes ? `${stats.tarefasPendentes} em validação` : "Nenhuma tarefa pendente"}
                  </p>
                </CardContent>
              </Card>
            </Link>
          </motion.div>

          {/* Resgates */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <Link to="/responsavel/resgates" className="block">
              <Card className="border-2 border-accent/20 transition-shadow hover:shadow-md">
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
                    <Gift className="h-5 w-5 text-accent" />
                  </div>
                  <CardTitle className="font-display text-lg">Resgates</CardTitle>
                  {(stats?.resgatesPendentes ?? 0) > 0 && (
                    <Badge variant="destructive" className="ml-auto">{stats!.resgatesPendentes}</Badge>
                  )}
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {stats?.resgatesPendentes ? `${stats.resgatesPendentes} pendente${stats.resgatesPendentes > 1 ? "s" : ""}` : "Gerencie resgates de recompensas"}
                  </p>
                </CardContent>
              </Card>
            </Link>
          </motion.div>

          {/* Contratos */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Link to="/responsavel/contrato" className="block">
              <Card className="border-2 border-purple-500/20 transition-shadow hover:shadow-md">
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10">
                    <FileText className="h-5 w-5 text-purple-600" />
                  </div>
                  <CardTitle className="font-display text-lg">Contratos</CardTitle>
                  {(stats?.contratosNotificacoes ?? 0) > 0 && (
                    <Badge variant="destructive" className="ml-auto">{stats!.contratosNotificacoes}</Badge>
                  )}
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {stats?.contratosNotificacoes ? `${stats.contratosNotificacoes} pendência${stats.contratosNotificacoes > 1 ? "s" : ""}` : "Gerencie os contratos de autonomia"}
                  </p>
                </CardContent>
              </Card>
            </Link>
          </motion.div>

          {/* Moedas dos Filhos */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
            <Link to="/responsavel/moedas-filhos" className="block">
              <Card className="border-2 border-coin/20 transition-shadow hover:shadow-md">
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-coin/10">
                    <Coins className="h-5 w-5 text-coin" />
                  </div>
                  <CardTitle className="font-display text-lg">Moedas</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Histórico de moedas dos filhos</p>
                </CardContent>
              </Card>
            </Link>
          </motion.div>

          {/* Mesada */}
          {hasChildWithMesada && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
              <Link to="/responsavel/mesada" className="block">
                <Card className="border-2 border-emerald-500/20 transition-shadow hover:shadow-md">
                  <CardHeader className="flex flex-row items-center gap-3 pb-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
                      <DollarSign className="h-5 w-5 text-emerald-600" />
                    </div>
                    <CardTitle className="font-display text-lg">Mesada</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">Acompanhe a mesada dos filhos</p>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

export default function ResponsavelDashboard() {
  const location = useLocation();

  if (location.pathname === "/responsavel/tarefas") {
    return <Navigate to="/responsavel/configuracoes?tab=tarefas" replace />;
  }

  if (location.pathname === "/responsavel/recompensas") {
    return <Navigate to="/responsavel/configuracoes?tab=recompensas" replace />;
  }

  if (location.pathname === "/responsavel/membros") {
    return <Navigate to="/responsavel/configuracoes?tab=membros" replace />;
  }

  return (
    <SelectedChildProvider>
      <RouteErrorBoundary>
        <Suspense fallback={<SubPageLoader />}>
          <PersistentViewStack
            basePath="/responsavel"
            views={[
              { key: "dashboard", element: <DashboardHome /> },
              { key: "atribuicao", path: "atribuicao", element: <AtribuirTarefas /> },
              { key: "aprovacoes", path: "aprovacoes", element: <AprovacoesPendentes /> },
              { key: "acompanhar", path: "acompanhar", element: <AcompanharTarefas /> },
              { key: "moedas-filhos", path: "moedas-filhos", element: <HistoricoMoedasFilhos /> },
              { key: "resgates", path: "resgates", element: <GerenciarResgates /> },
              { key: "configuracoes", path: "configuracoes", element: <Configuracoes /> },
              { key: "contrato", path: "contrato", element: <ContratoAutonomia /> },
              { key: "deveres", path: "deveres", element: <RegrasOuroFilhos /> },
              { key: "agenda", path: "agenda", element: <CompromissosFilhos /> },
              { key: "mesada", path: "mesada", element: <MesadaFilhos /> },
            ]}
          />
        </Suspense>
      </RouteErrorBoundary>
    </SelectedChildProvider>
  );
}
