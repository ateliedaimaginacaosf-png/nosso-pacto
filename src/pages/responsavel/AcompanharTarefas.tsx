import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useSelectedChild } from "@/contexts/SelectedChildContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { TarefaHistoricoSheet } from "@/components/TarefaHistoricoSheet";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Loader2, CheckCircle2, Clock, AlertTriangle, Archive, ClipboardList, Coins, XCircle } from "lucide-react";
import { motion } from "framer-motion";
import { format, startOfWeek, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Tables } from "@/integrations/supabase/types";

type Tarefa = Tables<"tarefa">;
type Profile = Tables<"profiles">;

type Periodo = "hoje" | "semana" | "mes";
type StatusFiltro = "todos" | "a_fazer" | "nao_feita" | "pendente_aprovacao" | "concluida" | "rejeitada" | "dispensa_solicitada" | "arquivada";

const statusConfig: Record<string, { label: string; icon: typeof CheckCircle2; color: string; badgeVariant: "default" | "secondary" | "destructive" | "outline" }> = {
  a_fazer: { label: "A fazer", icon: ClipboardList, color: "text-primary", badgeVariant: "default" },
  nao_feita: { label: "Não feita", icon: XCircle, color: "text-muted-foreground", badgeVariant: "destructive" },
  pendente_aprovacao: { label: "Aguardando", icon: Clock, color: "text-yellow-600", badgeVariant: "outline" },
  concluida: { label: "Concluída", icon: CheckCircle2, color: "text-success", badgeVariant: "secondary" },
  rejeitada: { label: "Rejeitada", icon: AlertTriangle, color: "text-destructive", badgeVariant: "destructive" },
  dispensa_solicitada: { label: "Dispensa", icon: Clock, color: "text-orange-500", badgeVariant: "outline" },
  arquivada: { label: "Dispensada", icon: Archive, color: "text-muted-foreground", badgeVariant: "secondary" },
};

function getEffectiveStatus(t: Tarefa): string {
  if (t.status === "a_fazer" && t.data_prevista) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const prevista = new Date(t.data_prevista + "T00:00:00");
    if (prevista < today) return "nao_feita";
  }
  return t.status;
}

function getDateRange(periodo: Periodo): { start: string; end: string } {
  const now = new Date();
  const todayStr = format(now, "yyyy-MM-dd");
  switch (periodo) {
    case "hoje":
      return { start: todayStr, end: todayStr };
    case "semana": {
      const s = startOfWeek(now, { weekStartsOn: 1 });
      return { start: format(s, "yyyy-MM-dd"), end: todayStr };
    }
    case "mes": {
      const s = startOfMonth(now);
      return { start: format(s, "yyyy-MM-dd"), end: todayStr };
    }
  }
}

export default function AcompanharTarefas() {
  const { profile } = useAuth();
  const [periodo, setPeriodo] = useState<Periodo>("hoje");
  const { selectedChildId: criancaId, setSelectedChildId: setCriancaId } = useSelectedChild();
  const [statusFiltro, setStatusFiltro] = useState<StatusFiltro>("todos");
  const [selectedTarefa, setSelectedTarefa] = useState<Tarefa | null>(null);

  const { data: criancas } = useQuery({
    queryKey: ["criancas-familia", profile?.familia_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("familia_id", profile!.familia_id)
        .eq("tipo_perfil", "crianca");
      if (error) throw error;
      return data as Profile[];
    },
    enabled: !!profile,
  });

  const dateRange = getDateRange(periodo);

  const { data: tarefas, isLoading } = useQuery({
    queryKey: ["acompanhar-tarefas", profile?.familia_id, dateRange.start, dateRange.end, criancaId],
    queryFn: async () => {
      let query = supabase
        .from("tarefa")
        .select("*")
        .eq("familia_id", profile!.familia_id)
        .gte("data_prevista", dateRange.start)
        .lte("data_prevista", dateRange.end)
        .order("data_prevista", { ascending: true });

      if (criancaId !== "todos") {
        query = query.eq("atribuida_a", criancaId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Tarefa[];
    },
    enabled: !!profile,
  });

  const filtradas = (tarefas ?? []).filter((t) => {
    const effective = getEffectiveStatus(t);
    if (statusFiltro !== "todos" && effective !== statusFiltro) return false;
    return true;
  });

  // Calculate lost coins per child
  const naoFeitas = (tarefas ?? []).filter((t) => getEffectiveStatus(t) === "nao_feita");
  const moedasPerdidasPorCrianca = (criancas ?? []).map((c) => {
    const total = naoFeitas
      .filter((t) => t.atribuida_a === c.user_id)
      .reduce((sum, t) => sum + t.valor_moedas, 0);
    const count = naoFeitas.filter((t) => t.atribuida_a === c.user_id).length;
    return { ...c, moedasPerdidas: total, tarefasNaoFeitas: count };
  }).filter((c) => c.moedasPerdidas > 0);

  const totalMoedasPerdidas = naoFeitas.reduce((sum, t) => sum + t.valor_moedas, 0);

  const getNomeCrianca = (userId: string | null) => {
    if (!userId) return "Sem atribuição";
    return criancas?.find((c) => c.user_id === userId)?.nome ?? "Desconhecido";
  };

  const handleClickPerdidas = (userId?: string) => {
    setStatusFiltro("nao_feita");
    if (userId) setCriancaId(userId);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-display text-2xl font-bold md:text-3xl">Acompanhar Tarefas 📋</h1>
          <p className="text-muted-foreground">Visualize as tarefas diárias dos filhos</p>
        </motion.div>

        {/* Lost coins summary */}
        {!isLoading && totalMoedasPerdidas > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card className="border-destructive/30 bg-destructive/5">
              <CardContent className="py-3">
                <div className="flex items-center gap-2 mb-2">
                  <XCircle className="h-4 w-4 text-destructive" />
                  <p className="text-sm font-semibold text-destructive">
                    Moedas perdidas: {totalMoedasPerdidas} 🪙
                  </p>
                  <span className="text-xs text-muted-foreground">({naoFeitas.length} tarefa{naoFeitas.length !== 1 ? "s" : ""} não feita{naoFeitas.length !== 1 ? "s" : ""})</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {moedasPerdidasPorCrianca.map((c) => (
                    <Badge
                      key={c.user_id}
                      variant="outline"
                      className="cursor-pointer hover:bg-destructive/10 transition-colors gap-1"
                      onClick={() => handleClickPerdidas(c.user_id)}
                    >
                      {c.nome}: -{c.moedasPerdidas} 🪙 ({c.tarefasNaoFeitas})
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
          <Tabs value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
            <TabsList>
              <TabsTrigger value="hoje">Hoje</TabsTrigger>
              <TabsTrigger value="semana">Semana</TabsTrigger>
              <TabsTrigger value="mes">Mês</TabsTrigger>
            </TabsList>
          </Tabs>

          <Select value={criancaId} onValueChange={setCriancaId}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Criança" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os filhos</SelectItem>
              {criancas?.map((c) => (
                <SelectItem key={c.user_id} value={c.user_id}>{c.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFiltro} onValueChange={(v) => setStatusFiltro(v as StatusFiltro)}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              <SelectItem value="a_fazer">A fazer</SelectItem>
              <SelectItem value="nao_feita">Não feita</SelectItem>
              <SelectItem value="pendente_aprovacao">Aguardando</SelectItem>
              <SelectItem value="concluida">Concluída</SelectItem>
              <SelectItem value="rejeitada">Rejeitada</SelectItem>
              <SelectItem value="dispensa_solicitada">Dispensa solicitada</SelectItem>
              <SelectItem value="arquivada">Dispensada</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Results */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !filtradas.length ? (
          <Card className="border-dashed border-2">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <ClipboardList className="mb-4 h-12 w-12 text-muted-foreground/50" />
              <p className="font-display text-lg font-semibold">Nenhuma tarefa encontrada</p>
              <p className="text-sm text-muted-foreground">Ajuste os filtros para ver mais resultados.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtradas.map((t, i) => {
              const effectiveStatus = getEffectiveStatus(t);
              const cfg = statusConfig[effectiveStatus] ?? statusConfig.a_fazer;
              const Icon = cfg.icon;
              return (
                <motion.div
                  key={t.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.02 }}
                >
                  <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setSelectedTarefa(t)}>
                    <CardContent className="flex items-center gap-3 py-3">
                      <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-muted ${cfg.color}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{t.nome}</p>
                        <p className="text-xs text-muted-foreground">
                          {getNomeCrianca(t.atribuida_a)} • {t.data_prevista ? format(new Date(t.data_prevista + "T00:00:00"), "dd MMM", { locale: ptBR }) : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {effectiveStatus === "arquivada" || effectiveStatus === "dispensa_solicitada" || effectiveStatus === "nao_feita" ? (
                          <span className="text-xs text-muted-foreground/60 line-through">{t.valor_moedas} 🪙</span>
                        ) : (
                          <span className="text-xs font-medium text-coin">{t.valor_moedas} 🪙</span>
                        )}
                        {t.tarefa_extra && (
                          <Badge variant="outline" className="text-xs border-accent text-accent-foreground bg-accent/20">
                            Extra
                          </Badge>
                        )}
                        <Badge variant={cfg.badgeVariant} className="text-xs">
                          {cfg.label}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Task Detail Sheet */}
        <TarefaHistoricoSheet
          tarefa={selectedTarefa}
          onClose={() => setSelectedTarefa(null)}
          getNomeUsuario={(userId) => {
            if (!userId) return "Sem atribuição";
            return criancas?.find((c) => c.user_id === userId)?.nome ?? "Desconhecido";
          }}
        />
      </div>
    </AppLayout>
  );
}
