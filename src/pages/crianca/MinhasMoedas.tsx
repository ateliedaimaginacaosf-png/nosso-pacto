import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Coins, TrendingUp, TrendingDown, ArrowRightLeft, Loader2, History } from "lucide-react";
import { motion } from "framer-motion";
import { format, startOfDay, startOfWeek, startOfMonth, subDays, subWeeks, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Tables } from "@/integrations/supabase/types";

type Transacao = Tables<"transacao">;

const tipoConfig: Record<string, { label: string; icon: typeof TrendingUp; color: string; sign: string; grupo: "credito" | "debito" }> = {
  ganho_tarefa: { label: "Tarefa concluída", icon: TrendingUp, color: "text-success", sign: "+", grupo: "credito" },
  bonus: { label: "Bônus", icon: TrendingUp, color: "text-success", sign: "+", grupo: "credito" },
  resgate_recompensa: { label: "Resgate", icon: TrendingDown, color: "text-destructive", sign: "-", grupo: "debito" },
  penalidade: { label: "Penalidade", icon: TrendingDown, color: "text-destructive", sign: "-", grupo: "debito" },
  reversao: { label: "Reversão", icon: ArrowRightLeft, color: "text-muted-foreground", sign: "", grupo: "debito" },
};

type Periodo = "hoje" | "semana" | "mes" | "todos";

function getDataInicio(periodo: Periodo): Date | null {
  const now = new Date();
  switch (periodo) {
    case "hoje": return startOfDay(now);
    case "semana": return startOfWeek(now, { weekStartsOn: 1 });
    case "mes": return startOfMonth(now);
    case "todos": return null;
  }
}

export default function MinhasMoedas() {
  const { profile } = useAuth();
  const [tipoFiltro, setTipoFiltro] = useState<"todos" | "credito" | "debito">("todos");
  const [periodo, setPeriodo] = useState<Periodo>("todos");

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

  const { data: transacoes, isLoading } = useQuery({
    queryKey: ["transacoes-crianca", profile?.user_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transacao")
        .select("*")
        .eq("user_id", profile!.user_id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as Transacao[];
    },
    enabled: !!profile,
  });

  const filtradas = (transacoes ?? []).filter((t) => {
    const cfg = tipoConfig[t.tipo] ?? tipoConfig.reversao;
    if (tipoFiltro !== "todos" && cfg.grupo !== tipoFiltro) return false;
    const dataInicio = getDataInicio(periodo);
    if (dataInicio && new Date(t.created_at) < dataInicio) return false;
    return true;
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
            <CardContent className="py-4 space-y-2">
              <div className="flex items-center gap-3">
                <Coins className="h-6 w-6 text-coin" />
                <span className="text-sm font-medium text-muted-foreground">Disponível:</span>
                <span className="font-display text-2xl font-bold text-coin-foreground">{(saldo ?? 0) - (provisionado ?? 0)}</span>
                <span className="text-sm text-muted-foreground">moedas</span>
              </div>
              {(provisionado ?? 0) > 0 && (
                <p className="text-xs text-muted-foreground ml-9">
                  ({provisionado} provisionadas para resgates pendentes • total: {saldo ?? 0})
                </p>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Tabs value={tipoFiltro} onValueChange={(v) => setTipoFiltro(v as typeof tipoFiltro)}>
            <TabsList>
              <TabsTrigger value="todos">Todos</TabsTrigger>
              <TabsTrigger value="credito">Créditos</TabsTrigger>
              <TabsTrigger value="debito">Débitos</TabsTrigger>
            </TabsList>
          </Tabs>
          <Select value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hoje">Hoje</SelectItem>
              <SelectItem value="semana">Esta semana</SelectItem>
              <SelectItem value="mes">Este mês</SelectItem>
              <SelectItem value="todos">Todo período</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Transaction history */}
        <div>
          <h2 className="font-display text-lg font-semibold mb-3">Histórico</h2>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : !filtradas.length ? (
            <Card className="border-dashed border-2">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <History className="mb-4 h-12 w-12 text-muted-foreground/50" />
                <p className="font-display text-lg font-semibold">Sem movimentações</p>
                <p className="text-sm text-muted-foreground">
                  {tipoFiltro === "todos" ? "Complete tarefas para começar a ganhar moedas!" : "Nenhuma movimentação encontrada para este filtro."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filtradas.map((t, i) => {
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
