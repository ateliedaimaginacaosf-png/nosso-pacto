import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Coins, ClipboardList, Gift, CheckCircle2, Clock, AlertTriangle, Trophy, FileText, AlertCircle } from "lucide-react";
import { getAvatarUrl } from "@/lib/avatar";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, Routes, Route } from "react-router-dom";
import MinhasTarefas from "./crianca/MinhasTarefas";
import LojaRecompensas from "./crianca/LojaRecompensas";
import MinhasMoedas from "./crianca/MinhasMoedas";
import MeusResgates from "./crianca/MeusResgates";
import ContratoAutonomiaCrianca from "./crianca/ContratoAutonomia";

function DashboardHome() {
  const { profile } = useAuth();

  const { data: saldo } = useQuery({
    queryKey: ["saldo-crianca", profile?.user_id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("calcular_saldo", { _user_id: profile!.user_id });
      if (error) throw error;
      return (data as number) ?? 0;
    },
    enabled: !!profile,
  });

  const { data: provisionado } = useQuery({
    queryKey: ["saldo-provisionado", profile?.user_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resgate_recompensa")
        .select("custo_moedas")
        .eq("crianca_id", profile!.user_id)
        .eq("status", "pendente");
      if (error) throw error;
      return data.reduce((sum, r) => sum + r.custo_moedas, 0);
    },
    enabled: !!profile,
  });

  const todayStr = format(new Date(), "yyyy-MM-dd");

  const { data: moedasAConquistar } = useQuery({
    queryKey: ["moedas-a-conquistar", profile?.user_id, todayStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tarefa")
        .select("valor_moedas")
        .eq("atribuida_a", profile!.user_id)
        .in("status", ["a_fazer", "pendente_aprovacao", "dispensa_solicitada", "rejeitada"])
        .eq("data_prevista", todayStr);
      if (error) throw error;
      return (data ?? []).reduce((sum, t) => sum + (t.valor_moedas ?? 0), 0);
    },
    enabled: !!profile,
  });

  const { data: stats } = useQuery({
    queryKey: ["crianca-stats", profile?.user_id, todayStr],
    queryFn: async () => {
      const [aFazer, pendentes, rejeitadas, concluidas, resgatesPendentes, contratoPendente] = await Promise.all([
        supabase
          .from("tarefa")
          .select("id", { count: "exact", head: true })
          .eq("atribuida_a", profile!.user_id)
          .eq("status", "a_fazer")
          .eq("data_prevista", todayStr),
        supabase
          .from("tarefa")
          .select("id", { count: "exact", head: true })
          .eq("atribuida_a", profile!.user_id)
          .in("status", ["pendente_aprovacao", "dispensa_solicitada"])
          .eq("data_prevista", todayStr),
        supabase
          .from("tarefa")
          .select("id", { count: "exact", head: true })
          .eq("atribuida_a", profile!.user_id)
          .eq("status", "rejeitada"),
        supabase
          .from("tarefa")
          .select("id", { count: "exact", head: true })
          .eq("atribuida_a", profile!.user_id)
          .in("status", ["concluida", "arquivada"])
          .eq("data_prevista", todayStr),
        supabase
          .from("resgate_recompensa")
          .select("id", { count: "exact", head: true })
          .eq("crianca_id", profile!.user_id)
          .in("status", ["pendente", "cancelamento_solicitado"]),
        supabase
          .from("contrato_versao")
          .select("id", { count: "exact", head: true })
          .eq("familia_id", profile!.familia_id)
          .eq("crianca_id", profile!.user_id)
          .eq("status", "pendente_aprovacao"),
      ]);
      return {
        aFazer: aFazer.count ?? 0,
        pendentes: pendentes.count ?? 0,
        rejeitadas: rejeitadas.count ?? 0,
        concluidas: concluidas.count ?? 0,
        resgatesPendentes: resgatesPendentes.count ?? 0,
        contratoPendente: (contratoPendente.count ?? 0),
      };
    },
    enabled: !!profile,
  });

  return (
    <AppLayout>
      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
          <Avatar className="h-12 w-12 border-2 border-primary/20">
            <AvatarImage src={getAvatarUrl(profile?.foto_url ?? null) ?? undefined} alt={profile?.nome} />
            <AvatarFallback className="bg-primary/10 text-lg">👧</AvatarFallback>
          </Avatar>
          <div>
            <h1 className="font-display text-2xl font-bold md:text-3xl">
              Olá, {profile?.nome}! 🚀
            </h1>
            <p className="text-muted-foreground">Seu painel de comando da autonomia</p>
          </div>
        </motion.div>

        {/* Coin Balance */}
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }}>
          <Link to="/crianca/moedas" className="block">
            <Card className="border-2 border-coin/30 bg-gradient-to-r from-coin/5 to-accent/5 transition-shadow hover:shadow-md cursor-pointer">
              <CardContent className="flex items-center gap-4 py-6 flex-wrap">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-coin/20 shrink-0">
                  <Coins className="h-7 w-7 text-coin" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-muted-foreground">Disponível</p>
                  <p className="font-display text-3xl font-bold text-coin-foreground">{(saldo ?? 0) - (provisionado ?? 0)} moedas</p>
                  {(provisionado ?? 0) > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      ({provisionado} provisionadas para resgates pendentes • total: {saldo ?? 0})
                    </p>
                  )}
                </div>
                {(moedasAConquistar ?? 0) > 0 && (
                  <div className="flex items-center gap-2 rounded-xl bg-primary/10 px-3 py-2">
                    <Trophy className="h-5 w-5 text-primary" />
                    <div>
                      <p className="text-[10px] font-medium text-muted-foreground leading-tight">A conquistar hoje</p>
                      <p className="font-display text-lg font-bold text-primary">+{moedasAConquistar} 🪙</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </Link>
        </motion.div>

        <div className="grid gap-4 sm:grid-cols-2">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Link to="/crianca/tarefas" className="block">
              <Card className="border-2 border-primary/20 transition-shadow hover:shadow-md">
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                    <ClipboardList className="h-5 w-5 text-primary" />
                  </div>
                  <CardTitle className="font-display text-lg">Tarefas do Dia</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold">{stats?.aFazer ?? 0}</span>
                    <span className="text-xs text-muted-foreground">a fazer</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-semibold">{stats?.pendentes ?? 0}</span>
                    <span className="text-xs text-muted-foreground">aguardando</span>
                  </div>
                  {(stats?.rejeitadas ?? 0) > 0 && (
                    <div className="flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                      <span className="text-sm font-semibold text-destructive">{stats.rejeitadas}</span>
                      <span className="text-xs text-destructive">devolvidas</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <Trophy className="h-4 w-4 text-success" />
                    <span className="text-sm font-semibold">{stats?.concluidas ?? 0}</span>
                    <span className="text-xs text-muted-foreground">concluídas</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <Link to="/crianca/loja" className="block">
              <Card className="border-2 border-accent/20 transition-shadow hover:shadow-md">
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
                    <Gift className="h-5 w-5 text-accent" />
                  </div>
                  <CardTitle className="font-display text-lg">Loja de Recompensas</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Troque moedas por prêmios incríveis! 🎁</p>
                </CardContent>
              </Card>
            </Link>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
            <Link to="/crianca/resgates" className="block">
              <Card className="border-2 border-purple-500/20 transition-shadow hover:shadow-md">
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10">
                    <Gift className="h-5 w-5 text-purple-600" />
                  </div>
                  <CardTitle className="font-display text-lg">Meus Resgates</CardTitle>
                  {(stats?.resgatesPendentes ?? 0) > 0 && (
                    <Badge variant="secondary" className="ml-auto">{stats!.resgatesPendentes}</Badge>
                  )}
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Acompanhe seus pedidos de recompensa</p>
                </CardContent>
              </Card>
            </Link>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
            <Link to="/crianca/contrato" className="block">
              <Card className={`border-2 transition-shadow hover:shadow-md ${(stats?.contratoPendente ?? 0) > 0 ? "border-yellow-500/40 bg-yellow-500/5" : "border-primary/20"}`}>
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${(stats?.contratoPendente ?? 0) > 0 ? "bg-yellow-500/10" : "bg-primary/10"}`}>
                    <FileText className={`h-5 w-5 ${(stats?.contratoPendente ?? 0) > 0 ? "text-yellow-600" : "text-primary"}`} />
                  </div>
                  <CardTitle className="font-display text-lg">Contrato de Autonomia</CardTitle>
                  {(stats?.contratoPendente ?? 0) > 0 && (
                    <Badge variant="destructive" className="ml-auto gap-1">
                      <AlertCircle className="h-3 w-3" />
                      Aprovar
                    </Badge>
                  )}
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {(stats?.contratoPendente ?? 0) > 0
                      ? "Você tem um contrato aguardando sua aprovação!"
                      : "Consulte suas regras e combinados"}
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

export default function CriancaDashboard() {
  return (
    <Routes>
      <Route index element={<DashboardHome />} />
      <Route path="tarefas" element={<MinhasTarefas />} />
      <Route path="loja" element={<LojaRecompensas />} />
      <Route path="moedas" element={<MinhasMoedas />} />
      <Route path="resgates" element={<MeusResgates />} />
      <Route path="contrato" element={<ContratoAutonomiaCrianca />} />
    </Routes>
  );
}
