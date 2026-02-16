import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, CheckCircle2, Clock, Coins, Loader2, Filter } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "@/hooks/use-toast";
import { useState, useMemo } from "react";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Tables } from "@/integrations/supabase/types";

type Tarefa = Tables<"tarefa">;

const categoriasEmoji: Record<string, string> = {
  limpeza: "🧹", estudos: "📚", exercicio: "🏃", higiene: "🧼",
  alimentacao: "🍎", organizacao: "📦", outros: "⭐",
};

const statusLabel: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  a_fazer: { label: "A Fazer", variant: "outline" },
  pendente_aprovacao: { label: "Aguardando", variant: "secondary" },
  concluida: { label: "Concluída", variant: "default" },
  rejeitada: { label: "Rejeitada", variant: "destructive" },
};

type FiltroPeriodo = "dia" | "semana" | "mes";
type AbaTarefa = "a_fazer" | "aguardando" | "concluidas" | "rejeitadas";

type StatusTarefa = "a_fazer" | "pendente_aprovacao" | "concluida" | "rejeitada" | "arquivada";

const statusMap: Record<AbaTarefa, StatusTarefa[]> = {
  a_fazer: ["a_fazer"],
  aguardando: ["pendente_aprovacao"],
  concluidas: ["concluida"],
  rejeitadas: ["rejeitada"],
};

export default function MinhasTarefas() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [filtroPeriodo, setFiltroPeriodo] = useState<FiltroPeriodo>("dia");
  const [abaAtiva, setAbaAtiva] = useState<AbaTarefa>("a_fazer");

  const now = new Date();
  const dateRange = useMemo(() => {
    if (filtroPeriodo === "dia") return { start: startOfDay(now), end: endOfDay(now) };
    if (filtroPeriodo === "semana") return { start: startOfWeek(now, { locale: ptBR }), end: endOfWeek(now, { locale: ptBR }) };
    return { start: startOfMonth(now), end: endOfMonth(now) };
  }, [filtroPeriodo]);

  const startStr = format(dateRange.start, "yyyy-MM-dd");
  const endStr = format(dateRange.end, "yyyy-MM-dd");

  const fetchTarefas = async (aba: AbaTarefa) => {
    const statuses = statusMap[aba];
    let query = supabase
      .from("tarefa")
      .select("*")
      .eq("atribuida_a", profile!.user_id)
      .in("status", statuses);

    if (aba === "concluidas") {
      // Filter completed tasks by approval date
      query = query
        .gte("data_aprovacao", startStr)
        .lte("data_aprovacao", endStr + "T23:59:59.999Z");
    } else {
      query = query
        .gte("data_prevista", startStr)
        .lte("data_prevista", endStr);
    }

    const { data, error } = await query.order("data_prevista", { ascending: true });
    if (error) throw error;
    return data as Tarefa[];
  };

  const { data: tarefasAFazer, isLoading: l1 } = useQuery({
    queryKey: ["minhas-tarefas", "a_fazer", profile?.user_id, filtroPeriodo],
    queryFn: () => fetchTarefas("a_fazer"),
    enabled: !!profile,
  });

  const { data: tarefasAguardando, isLoading: l2 } = useQuery({
    queryKey: ["minhas-tarefas", "aguardando", profile?.user_id, filtroPeriodo],
    queryFn: () => fetchTarefas("aguardando"),
    enabled: !!profile,
  });

  const { data: tarefasConcluidas, isLoading: l3 } = useQuery({
    queryKey: ["minhas-tarefas", "concluidas", profile?.user_id, filtroPeriodo],
    queryFn: () => fetchTarefas("concluidas"),
    enabled: !!profile,
  });

  const { data: tarefasRejeitadas, isLoading: l4 } = useQuery({
    queryKey: ["minhas-tarefas", "rejeitadas", profile?.user_id, filtroPeriodo],
    queryFn: () => fetchTarefas("rejeitadas"),
    enabled: !!profile,
  });

  const dataMap: Record<AbaTarefa, { data: Tarefa[] | undefined; loading: boolean }> = {
    a_fazer: { data: tarefasAFazer, loading: l1 },
    aguardando: { data: tarefasAguardando, loading: l2 },
    concluidas: { data: tarefasConcluidas, loading: l3 },
    rejeitadas: { data: tarefasRejeitadas, loading: l4 },
  };

  const concluirMutation = useMutation({
    mutationFn: async (tarefaId: string) => {
      const { error } = await supabase
        .from("tarefa")
        .update({ status: "pendente_aprovacao", data_conclusao: new Date().toISOString() })
        .eq("id", tarefaId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["minhas-tarefas"] });
      queryClient.invalidateQueries({ queryKey: ["crianca-stats"] });
      toast({ title: "Tarefa enviada! ✅", description: "Aguardando aprovação do responsável." });
    },
    onError: () => toast({ title: "Erro", description: "Não foi possível concluir a tarefa.", variant: "destructive" }),
  });

  const periodoLabels: Record<FiltroPeriodo, string> = {
    dia: "Hoje",
    semana: "Esta semana",
    mes: "Este mês",
  };

  const aFazerCount = (tarefasAFazer?.length ?? 0) + (tarefasRejeitadas?.length ?? 0);
  const aguardandoCount = tarefasAguardando?.length ?? 0;
  const concluidasCount = tarefasConcluidas?.length ?? 0;
  const rejeitadasCount = tarefasRejeitadas?.length ?? 0;

  const renderTarefaCard = (tarefa: Tarefa, i: number) => (
    <motion.div key={tarefa.id} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
      <Card className="border-2 transition-shadow hover:shadow-md">
        <CardContent className="flex items-center gap-3 py-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-xl shrink-0">
            {categoriasEmoji[tarefa.categoria] ?? "⭐"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-display font-semibold text-sm truncate">{tarefa.nome}</span>
              <Badge variant={statusLabel[tarefa.status]?.variant ?? "outline"} className="text-[10px]">
                {statusLabel[tarefa.status]?.label ?? tarefa.status}
              </Badge>
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-0.5 font-semibold text-coin-foreground">
                <Coins className="h-3 w-3 text-coin" /> {tarefa.valor_moedas}
              </span>
              {tarefa.data_prevista && filtroPeriodo !== "dia" && (
                <span>• {format(new Date(tarefa.data_prevista + "T12:00:00"), "dd/MM", { locale: ptBR })}</span>
              )}
            </div>
            {tarefa.status === "rejeitada" && tarefa.comentario_responsavel && (
              <p className="mt-1 text-xs text-destructive">💬 {tarefa.comentario_responsavel}</p>
            )}
          </div>
          {(tarefa.status === "a_fazer" || tarefa.status === "rejeitada") && (
            <Button size="sm" onClick={() => concluirMutation.mutate(tarefa.id)} disabled={concluirMutation.isPending} className="shrink-0">
              {concluirMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4 mr-1" /> Feito!</>}
            </Button>
          )}
          {tarefa.status === "pendente_aprovacao" && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
              <Clock className="h-3.5 w-3.5" /> Aguardando
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );

  const renderEmpty = (msg: string) => (
    <Card className="border-dashed border-2">
      <CardContent className="flex flex-col items-center justify-center py-8 text-center">
        <ClipboardList className="mb-3 h-10 w-10 text-muted-foreground/50" />
        <p className="font-display font-semibold">{msg}</p>
        <p className="text-sm text-muted-foreground">{periodoLabels[filtroPeriodo]}</p>
      </CardContent>
    </Card>
  );

  const renderLoading = () => (
    <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
  );

  const renderTab = (aba: AbaTarefa, emptyMsg: string) => {
    const { data, loading } = dataMap[aba];
    if (loading) return renderLoading();
    if (!data?.length) return renderEmpty(emptyMsg);
    return (
      <AnimatePresence>
        {data.map((t, i) => renderTarefaCard(t, i))}
      </AnimatePresence>
    );
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-display text-2xl font-bold md:text-3xl">Minhas Tarefas 📋</h1>
          <p className="text-muted-foreground capitalize">
            {format(now, "EEEE, d 'de' MMMM", { locale: ptBR })}
          </p>
        </motion.div>

        {/* Period filter */}
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={filtroPeriodo} onValueChange={(v) => setFiltroPeriodo(v as FiltroPeriodo)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dia">Hoje</SelectItem>
              <SelectItem value="semana">Esta semana</SelectItem>
              <SelectItem value="mes">Este mês</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Tabs value={abaAtiva} onValueChange={(v) => setAbaAtiva(v as AbaTarefa)}>
          <TabsList className="w-full">
            <TabsTrigger value="a_fazer" className="flex-1 gap-1 text-xs sm:text-sm">
              A Fazer {aFazerCount > 0 && <Badge variant="outline" className="text-[10px] ml-1">{aFazerCount}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="aguardando" className="flex-1 gap-1 text-xs sm:text-sm">
              Aguardando {aguardandoCount > 0 && <Badge variant="secondary" className="text-[10px] ml-1">{aguardandoCount}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="concluidas" className="flex-1 gap-1 text-xs sm:text-sm">
              Concluídas {concluidasCount > 0 && <Badge className="text-[10px] ml-1 bg-primary/20 text-primary border-primary/30">{concluidasCount}</Badge>}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="a_fazer" className="space-y-2 mt-4">
            {l1 || l4 ? renderLoading() : (
              (() => {
                const combined = [...(tarefasAFazer ?? []), ...(tarefasRejeitadas ?? [])];
                if (!combined.length) return renderEmpty("Nenhuma tarefa a fazer");
                return <AnimatePresence>{combined.map((t, i) => renderTarefaCard(t, i))}</AnimatePresence>;
              })()
            )}
          </TabsContent>

          <TabsContent value="aguardando" className="space-y-2 mt-4">
            {renderTab("aguardando", "Nenhuma tarefa aguardando aprovação")}
          </TabsContent>

          <TabsContent value="concluidas" className="space-y-2 mt-4">
            {renderTab("concluidas", "Nenhuma tarefa concluída")}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
