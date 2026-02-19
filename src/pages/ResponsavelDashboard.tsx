import { useAuth } from "@/contexts/AuthContext";
import { SelectedChildProvider } from "@/contexts/SelectedChildContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, CalendarDays, Coins, Gift, FileText } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Link, Routes, Route } from "react-router-dom";
import GerenciarTarefas from "./responsavel/GerenciarTarefas";
import AtribuirTarefas from "./responsavel/AtribuirTarefas";
import GerenciarRecompensas from "./responsavel/GerenciarRecompensas";
import GerenciarMembros from "./responsavel/GerenciarMembros";
import ConfiguracaoFamilia from "./responsavel/ConfiguracaoFamilia";
import AprovacoesPendentes from "./responsavel/AprovacoesPendentes";
import AcompanharTarefas from "./responsavel/AcompanharTarefas";
import HistoricoMoedasFilhos from "./responsavel/HistoricoMoedasFilhos";
import GerenciarResgates from "./responsavel/GerenciarResgates";
import ContratoAutonomia from "./responsavel/ContratoAutonomia";
import RegrasOuroFilhos from "./responsavel/RegrasOuroFilhos";

function DashboardHome() {
  const { profile } = useAuth();

  const { data: stats } = useQuery({
    queryKey: ["responsavel-stats", profile?.familia_id],
    queryFn: async () => {
      const [pendentes, membrosRes, resgatesPend, cancelPend, revisoesPend, contratosRejeitados, contratosNewer] = await Promise.all([
        supabase
          .from("tarefa")
          .select("id", { count: "exact", head: true })
          .eq("familia_id", profile!.familia_id)
          .in("status", ["pendente_aprovacao", "dispensa_solicitada"]),
        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("familia_id", profile!.familia_id),
        supabase
          .from("resgate_recompensa")
          .select("id", { count: "exact", head: true })
          .eq("familia_id", profile!.familia_id)
          .eq("status", "pendente"),
        supabase
          .from("resgate_recompensa")
          .select("id", { count: "exact", head: true })
          .eq("familia_id", profile!.familia_id)
          .eq("status", "cancelamento_solicitado"),
        supabase
          .from("contrato_revisao")
          .select("id", { count: "exact", head: true })
          .eq("familia_id", profile!.familia_id)
          .eq("status", "pendente"),
        supabase
          .from("contrato_versao")
          .select("id, crianca_id, versao, status")
          .eq("familia_id", profile!.familia_id)
          .eq("status", "rejeitado"),
        supabase
          .from("contrato_versao")
          .select("crianca_id, versao, status")
          .eq("familia_id", profile!.familia_id)
          .in("status", ["rascunho", "pendente_aprovacao", "vigente"]),
      ]);

      const rejeitados = contratosRejeitados.data ?? [];
      const newer = contratosNewer.data ?? [];
      const rejeitadosPendentes = rejeitados.filter((r) => {
        return !newer.some((n) => n.crianca_id === r.crianca_id && n.versao > r.versao);
      }).length;

      return {
        tarefasPendentes: pendentes.count ?? 0,
        membros: membrosRes.count ?? 0,
        resgatesPendentes: (resgatesPend.count ?? 0) + (cancelPend.count ?? 0),
        contratosNotificacoes: (revisoesPend.count ?? 0) + rejeitadosPendentes,
      };
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
                    {stats?.tarefasPendentes ? `${stats.tarefasPendentes} aguardando aprovação` : "Gerencie tarefas no calendário"}
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
        </div>
      </div>
    </AppLayout>
  );
}

export default function ResponsavelDashboard() {
  return (
    <SelectedChildProvider>
      <Routes>
        <Route index element={<DashboardHome />} />
        <Route path="tarefas" element={<GerenciarTarefas />} />
        <Route path="atribuicao" element={<AtribuirTarefas />} />
        <Route path="aprovacoes" element={<AprovacoesPendentes />} />
        <Route path="acompanhar" element={<AcompanharTarefas />} />
        <Route path="moedas-filhos" element={<HistoricoMoedasFilhos />} />
        <Route path="recompensas" element={<GerenciarRecompensas />} />
        <Route path="resgates" element={<GerenciarResgates />} />
        <Route path="membros" element={<GerenciarMembros />} />
        <Route path="config" element={<ConfiguracaoFamilia />} />
        <Route path="contrato" element={<ContratoAutonomia />} />
        <Route path="deveres" element={<RegrasOuroFilhos />} />
      </Routes>
    </SelectedChildProvider>
  );
}
