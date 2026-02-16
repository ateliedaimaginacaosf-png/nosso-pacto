import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Coins, ClipboardList, Gift, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Link, Routes, Route } from "react-router-dom";
import MinhasTarefas from "./crianca/MinhasTarefas";
import LojaRecompensas from "./crianca/LojaRecompensas";
import MinhasMoedas from "./crianca/MinhasMoedas";

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

  const todayStr = format(new Date(), "yyyy-MM-dd");

  const { data: stats } = useQuery({
    queryKey: ["crianca-stats", profile?.user_id, todayStr],
    queryFn: async () => {
      const [aFazer, pendentes, rejeitadas] = await Promise.all([
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
          .eq("status", "pendente_aprovacao")
          .eq("data_prevista", todayStr),
        supabase
          .from("tarefa")
          .select("id", { count: "exact", head: true })
          .eq("atribuida_a", profile!.user_id)
          .eq("status", "rejeitada"),
      ]);
      return {
        aFazer: aFazer.count ?? 0,
        pendentes: pendentes.count ?? 0,
        rejeitadas: rejeitadas.count ?? 0,
      };
    },
    enabled: !!profile,
  });

  return (
    <AppLayout>
      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-display text-2xl font-bold md:text-3xl">
            Olá, {profile?.nome}! 🚀
          </h1>
          <p className="text-muted-foreground">Seu painel de comando da autonomia</p>
        </motion.div>

        {/* Coin Balance */}
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }}>
          <Card className="border-2 border-coin/30 bg-gradient-to-r from-coin/5 to-accent/5">
            <CardContent className="flex items-center gap-4 py-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-coin/20">
                <Coins className="h-7 w-7 text-coin" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Saldo de Moedas</p>
                <p className="font-display text-3xl font-bold text-coin-foreground">{saldo ?? 0}</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <div className="grid gap-4 sm:grid-cols-2">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Link to="/crianca/tarefas" className="block">
              <Card className="border-2 border-primary/20 transition-shadow hover:shadow-md">
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                    <ClipboardList className="h-5 w-5 text-primary" />
                  </div>
                  <CardTitle className="font-display text-lg">Tarefas do Meu Dia</CardTitle>
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
    </Routes>
  );
}
