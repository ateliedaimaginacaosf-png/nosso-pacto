import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Loader2, CheckCircle2, Clock, AlertTriangle, Archive, ClipboardList } from "lucide-react";
import { motion } from "framer-motion";
import { format, startOfDay, startOfWeek, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Tables } from "@/integrations/supabase/types";

type Tarefa = Tables<"tarefa">;
type Profile = Tables<"profiles">;

type Periodo = "hoje" | "semana" | "mes";
type StatusFiltro = "todos" | "a_fazer" | "pendente_aprovacao" | "concluida" | "rejeitada" | "dispensa_solicitada" | "arquivada";

const statusConfig: Record<string, { label: string; icon: typeof CheckCircle2; color: string; badgeVariant: "default" | "secondary" | "destructive" | "outline" }> = {
  a_fazer: { label: "A fazer", icon: ClipboardList, color: "text-primary", badgeVariant: "default" },
  pendente_aprovacao: { label: "Aguardando", icon: Clock, color: "text-yellow-600", badgeVariant: "outline" },
  concluida: { label: "Concluída", icon: CheckCircle2, color: "text-success", badgeVariant: "secondary" },
  rejeitada: { label: "Rejeitada", icon: AlertTriangle, color: "text-destructive", badgeVariant: "destructive" },
  dispensa_solicitada: { label: "Dispensa", icon: Clock, color: "text-orange-500", badgeVariant: "outline" },
  arquivada: { label: "Dispensada", icon: Archive, color: "text-muted-foreground", badgeVariant: "secondary" },
};

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
  const [criancaId, setCriancaId] = useState<string>("todos");
  const [statusFiltro, setStatusFiltro] = useState<StatusFiltro>("todos");

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
    if (statusFiltro !== "todos" && t.status !== statusFiltro) return false;
    return true;
  });

  const getNomeCrianca = (userId: string | null) => {
    if (!userId) return "Sem atribuição";
    return criancas?.find((c) => c.user_id === userId)?.nome ?? "Desconhecido";
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-display text-2xl font-bold md:text-3xl">Acompanhar Tarefas 📋</h1>
          <p className="text-muted-foreground">Visualize as tarefas diárias dos filhos</p>
        </motion.div>

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
              const cfg = statusConfig[t.status] ?? statusConfig.a_fazer;
              const Icon = cfg.icon;
              return (
                <motion.div
                  key={t.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.02 }}
                >
                  <Card>
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
                        <span className="text-xs font-medium text-coin">{t.valor_moedas} 🪙</span>
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
      </div>
    </AppLayout>
  );
}
