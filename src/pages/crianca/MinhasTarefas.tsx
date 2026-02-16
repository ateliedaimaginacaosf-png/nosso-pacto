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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  rejeitada: { label: "Devolvida", variant: "destructive" },
  dispensa_solicitada: { label: "Dispensa Pedida", variant: "secondary" },
};

type FiltroPeriodo = "dia" | "semana" | "mes";
type AbaTarefa = "a_fazer" | "aguardando" | "concluidas";

type StatusTarefa = "a_fazer" | "pendente_aprovacao" | "concluida" | "rejeitada" | "arquivada" | "dispensa_solicitada";

const statusMap: Record<AbaTarefa, StatusTarefa[]> = {
  a_fazer: ["a_fazer", "rejeitada"],
  aguardando: ["pendente_aprovacao", "dispensa_solicitada"],
  concluidas: ["concluida"],
};

export default function MinhasTarefas() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [filtroPeriodo, setFiltroPeriodo] = useState<FiltroPeriodo>("dia");
  const [abaAtiva, setAbaAtiva] = useState<AbaTarefa>("a_fazer");

  // Dialog states
  const [concluirTarefaId, setConcluirTarefaId] = useState<string | null>(null);
  const [mensagemConclusao, setMensagemConclusao] = useState("");
  const [dispensaTarefaId, setDispensaTarefaId] = useState<string | null>(null);
  const [justificativaDispensa, setJustificativaDispensa] = useState("");

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

  const concluirMutation = useMutation({
    mutationFn: async ({ tarefaId, mensagem }: { tarefaId: string; mensagem: string }) => {
      const { error } = await supabase
        .from("tarefa")
        .update({
          status: "pendente_aprovacao" as StatusTarefa,
          data_conclusao: new Date().toISOString(),
          justificativa: mensagem || null,
        })
        .eq("id", tarefaId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["minhas-tarefas"] });
      queryClient.invalidateQueries({ queryKey: ["crianca-stats"] });
      toast({ title: "Tarefa enviada! ✅", description: "Aguardando aprovação do responsável." });
      setConcluirTarefaId(null);
      setMensagemConclusao("");
    },
    onError: () => toast({ title: "Erro", description: "Não foi possível concluir a tarefa.", variant: "destructive" }),
  });

  const dispensaMutation = useMutation({
    mutationFn: async ({ tarefaId, justificativa }: { tarefaId: string; justificativa: string }) => {
      const { error } = await supabase
        .from("tarefa")
        .update({
          status: "dispensa_solicitada" as StatusTarefa,
          justificativa: justificativa,
        })
        .eq("id", tarefaId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["minhas-tarefas"] });
      queryClient.invalidateQueries({ queryKey: ["crianca-stats"] });
      toast({ title: "Pedido enviado! 🙏", description: "Aguardando resposta do responsável." });
      setDispensaTarefaId(null);
      setJustificativaDispensa("");
    },
    onError: () => toast({ title: "Erro", description: "Não foi possível pedir dispensa.", variant: "destructive" }),
  });

  const periodoLabels: Record<FiltroPeriodo, string> = {
    dia: "Hoje",
    semana: "Esta semana",
    mes: "Este mês",
  };

  const aFazerCount = tarefasAFazer?.length ?? 0;
  const aguardandoCount = tarefasAguardando?.length ?? 0;
  const concluidasCount = tarefasConcluidas?.length ?? 0;

  const renderTarefaCard = (tarefa: Tarefa, i: number) => (
    <motion.div key={tarefa.id} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
      <Card className="border-2 transition-shadow hover:shadow-md">
        <CardContent className="flex items-start gap-3 py-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-xl shrink-0 mt-0.5">
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
            {tarefa.status === "dispensa_solicitada" && tarefa.justificativa && (
              <p className="mt-1 text-xs text-muted-foreground italic">📝 {tarefa.justificativa}</p>
            )}
            {tarefa.status === "pendente_aprovacao" && tarefa.justificativa && (
              <p className="mt-1 text-xs text-muted-foreground italic">💬 {tarefa.justificativa}</p>
            )}
          </div>
          <div className="flex flex-col gap-1 shrink-0">
            {(tarefa.status === "a_fazer" || tarefa.status === "rejeitada") && (
              <>
                <Button size="sm" onClick={() => setConcluirTarefaId(tarefa.id)} className="text-xs">
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Feito!
                </Button>
                <Button size="sm" variant="outline" onClick={() => setDispensaTarefaId(tarefa.id)} className="text-xs">
                  🙏 Dispensa
                </Button>
              </>
            )}
            {(tarefa.status === "pendente_aprovacao" || tarefa.status === "dispensa_solicitada") && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" /> Aguardando
              </div>
            )}
          </div>
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

  const renderTab = (aba: AbaTarefa, emptyMsg: string, loading: boolean, data: Tarefa[] | undefined) => {
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
            {renderTab("a_fazer", "Nenhuma tarefa a fazer", l1, tarefasAFazer)}
          </TabsContent>

          <TabsContent value="aguardando" className="space-y-2 mt-4">
            {renderTab("aguardando", "Nenhuma tarefa aguardando", l2, tarefasAguardando)}
          </TabsContent>

          <TabsContent value="concluidas" className="space-y-2 mt-4">
            {renderTab("concluidas", "Nenhuma tarefa concluída", l3, tarefasConcluidas)}
          </TabsContent>
        </Tabs>

        {/* Dialog: Concluir tarefa com mensagem */}
        <Dialog open={!!concluirTarefaId} onOpenChange={(o) => { if (!o) { setConcluirTarefaId(null); setMensagemConclusao(""); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-display">Marcar como Feito ✅</DialogTitle>
            </DialogHeader>
            <div>
              <Label>Mensagem para o responsável (opcional)</Label>
              <Textarea
                placeholder="Conte como você fez a tarefa..."
                value={mensagemConclusao}
                onChange={e => setMensagemConclusao(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setConcluirTarefaId(null); setMensagemConclusao(""); }}>Cancelar</Button>
              <Button
                onClick={() => concluirTarefaId && concluirMutation.mutate({ tarefaId: concluirTarefaId, mensagem: mensagemConclusao })}
                disabled={concluirMutation.isPending}
              >
                {concluirMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enviar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog: Pedir dispensa */}
        <Dialog open={!!dispensaTarefaId} onOpenChange={(o) => { if (!o) { setDispensaTarefaId(null); setJustificativaDispensa(""); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-display">Pedir Dispensa 🙏</DialogTitle>
            </DialogHeader>
            <div>
              <Label>Por que você não pode fazer essa tarefa?</Label>
              <Textarea
                placeholder="Explique o motivo..."
                value={justificativaDispensa}
                onChange={e => setJustificativaDispensa(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setDispensaTarefaId(null); setJustificativaDispensa(""); }}>Cancelar</Button>
              <Button
                onClick={() => dispensaTarefaId && justificativaDispensa.trim() && dispensaMutation.mutate({ tarefaId: dispensaTarefaId, justificativa: justificativaDispensa })}
                disabled={dispensaMutation.isPending || !justificativaDispensa.trim()}
              >
                {dispensaMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enviar Pedido"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
