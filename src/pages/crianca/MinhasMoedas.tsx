import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Coins, TrendingUp, TrendingDown, ArrowRightLeft, Loader2, History } from "lucide-react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Tables } from "@/integrations/supabase/types";

type Transacao = Tables<"transacao">;

const tipoConfig: Record<string, { label: string; icon: typeof TrendingUp; color: string; sign: string }> = {
  ganho_tarefa: { label: "Tarefa concluída", icon: TrendingUp, color: "text-success", sign: "+" },
  bonus: { label: "Bônus", icon: TrendingUp, color: "text-success", sign: "+" },
  resgate_recompensa: { label: "Resgate", icon: TrendingDown, color: "text-destructive", sign: "-" },
  penalidade: { label: "Penalidade", icon: TrendingDown, color: "text-destructive", sign: "-" },
  reversao: { label: "Reversão", icon: ArrowRightLeft, color: "text-muted-foreground", sign: "" },
};

export default function MinhasMoedas() {
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

  const { data: transacoes, isLoading } = useQuery({
    queryKey: ["transacoes-crianca", profile?.user_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transacao")
        .select("*")
        .eq("user_id", profile!.user_id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as Transacao[];
    },
    enabled: !!profile,
  });

  return (
    <AppLayout>
      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-display text-2xl font-bold md:text-3xl">Minhas Moedas 💰</h1>
          <p className="text-muted-foreground">Acompanhe seus ganhos e gastos</p>
        </motion.div>

        {/* Balance card */}
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }}>
          <Card className="border-2 border-coin/30 bg-gradient-to-r from-coin/5 to-accent/5">
            <CardContent className="flex items-center gap-4 py-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-coin/20">
                <Coins className="h-7 w-7 text-coin" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Saldo Atual</p>
                <p className="font-display text-3xl font-bold text-coin-foreground">{saldo ?? 0}</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Transaction history */}
        <div>
          <h2 className="font-display text-lg font-semibold mb-3">Histórico</h2>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : !transacoes?.length ? (
            <Card className="border-dashed border-2">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <History className="mb-4 h-12 w-12 text-muted-foreground/50" />
                <p className="font-display text-lg font-semibold">Sem movimentações ainda</p>
                <p className="text-sm text-muted-foreground">Complete tarefas para começar a ganhar moedas!</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {transacoes.map((t, i) => {
                const cfg = tipoConfig[t.tipo] ?? tipoConfig.reversao;
                const Icon = cfg.icon;
                return (
                  <motion.div
                    key={t.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                  >
                    <Card>
                      <CardContent className="flex items-center gap-3 py-3">
                        <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-muted ${cfg.color}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{t.descricao ?? cfg.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(t.created_at), "dd MMM yyyy, HH:mm", { locale: ptBR })}
                          </p>
                        </div>
                        <span className={`font-display font-bold ${cfg.color}`}>
                          {cfg.sign}{t.quantidade_moedas}
                        </span>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
