import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, ClipboardList, Gift, CheckCircle2, CalendarDays, Eye, Coins } from "lucide-react";
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
function DashboardHome() {
  const { profile } = useAuth();

  const { data: stats } = useQuery({
    queryKey: ["responsavel-stats", profile?.familia_id],
    queryFn: async () => {
      const [pendentes, membrosRes, resgatesPend] = await Promise.all([
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
      ]);
      return {
        tarefasPendentes: pendentes.count ?? 0,
        membros: membrosRes.count ?? 0,
        resgatesPendentes: resgatesPend.count ?? 0,
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
          <p className="text-muted-foreground">Painel de gestão da família</p>
        </motion.div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Tarefas - only task management */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Link to="/responsavel/tarefas" className="block">
              <Card className="border-2 border-primary/20 transition-shadow hover:shadow-md">
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                    <ClipboardList className="h-5 w-5 text-primary" />
                  </div>
                  <CardTitle className="font-display text-lg">Tarefas</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Crie e gerencie modelos de tarefas</p>
                </CardContent>
              </Card>
            </Link>
          </motion.div>

          {/* Aprovações Pendentes - NEW */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <Link to="/responsavel/aprovacoes" className="block">
              <Card className="border-2 border-yellow-500/20 transition-shadow hover:shadow-md">
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-yellow-500/10">
                    <CheckCircle2 className="h-5 w-5 text-yellow-600" />
                  </div>
                  <CardTitle className="font-display text-lg">Aprovações</CardTitle>
                  {(stats?.tarefasPendentes ?? 0) > 0 && (
                    <Badge variant="destructive" className="ml-auto">{stats!.tarefasPendentes}</Badge>
                  )}
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {stats?.tarefasPendentes ? `${stats.tarefasPendentes} aguardando aprovação` : "Nenhuma pendência"}
                  </p>
                </CardContent>
              </Card>
            </Link>
          </motion.div>

          {/* Recompensas */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Link to="/responsavel/recompensas" className="block">
              <Card className="border-2 border-accent/20 transition-shadow hover:shadow-md">
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
                    <Gift className="h-5 w-5 text-accent" />
                  </div>
                  <CardTitle className="font-display text-lg">Recompensas</CardTitle>
                  {(stats?.resgatesPendentes ?? 0) > 0 && (
                    <Badge variant="destructive" className="ml-auto">{stats!.resgatesPendentes}</Badge>
                  )}
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {stats?.resgatesPendentes ? `${stats.resgatesPendentes} resgates pendentes` : "Gerencie prêmios da família"}
                  </p>
                </CardContent>
              </Card>
            </Link>
          </motion.div>

          {/* Calendário */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
            <Link to="/responsavel/atribuicao" className="block">
              <Card className="border-2 border-blue-500/20 transition-shadow hover:shadow-md">
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
                    <CalendarDays className="h-5 w-5 text-blue-600" />
                  </div>
                  <CardTitle className="font-display text-lg">Calendário</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Atribua tarefas no calendário</p>
                </CardContent>
              </Card>
            </Link>
          </motion.div>

          {/* Acompanhar Tarefas */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.27 }}>
            <Link to="/responsavel/acompanhar" className="block">
              <Card className="border-2 border-green-500/20 transition-shadow hover:shadow-md">
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-500/10">
                    <Eye className="h-5 w-5 text-green-600" />
                  </div>
                  <CardTitle className="font-display text-lg">Acompanhar</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Veja as tarefas diárias dos filhos</p>
                </CardContent>
              </Card>
            </Link>
          </motion.div>

          {/* Moedas dos Filhos */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }}>
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

          {/* Membros */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <Link to="/responsavel/membros" className="block">
              <Card className="border-2 border-secondary/20 transition-shadow hover:shadow-md">
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary/10">
                    <Users className="h-5 w-5 text-secondary" />
                  </div>
                  <CardTitle className="font-display text-lg">Membros</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {stats?.membros ? `${stats.membros} membros na família` : "Gerencie membros"}
                  </p>
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
    <Routes>
      <Route index element={<DashboardHome />} />
      <Route path="tarefas" element={<GerenciarTarefas />} />
      <Route path="atribuicao" element={<AtribuirTarefas />} />
      <Route path="aprovacoes" element={<AprovacoesPendentes />} />
      <Route path="acompanhar" element={<AcompanharTarefas />} />
      <Route path="moedas-filhos" element={<HistoricoMoedasFilhos />} />
      <Route path="recompensas" element={<GerenciarRecompensas />} />
      <Route path="membros" element={<GerenciarMembros />} />
      <Route path="config" element={<ConfiguracaoFamilia />} />
    </Routes>
  );
}
