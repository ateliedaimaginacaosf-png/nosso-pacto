import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, CheckCircle2, XCircle, Coins, Filter, User } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "@/hooks/use-toast";
import { useState, useMemo } from "react";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Tables } from "@/integrations/supabase/types";

type Tarefa = Tables<"tarefa">;
type Profile = Tables<"profiles">;

const categoriasEmoji: Record<string, string> = {
  limpeza: "🧹", estudos: "📚", exercicio: "🏃", higiene: "🧼",
  alimentacao: "🍎", organizacao: "📦", outros: "⭐",
};

type FiltroPeriodo = "dia" | "semana" | "mes";
type AbaAprovacao = "pendentes" | "reprovadas" | "aprovadas";

type StatusTarefa = "a_fazer" | "pendente_aprovacao" | "concluida" | "rejeitada" | "arquivada" | "dispensa_solicitada";

const statusMap: Record<AbaAprovacao, StatusTarefa[]> = {
  pendentes: ["pendente_aprovacao", "dispensa_solicitada"],
  reprovadas: ["rejeitada"],
  aprovadas: ["concluida"],
};

const dateField: Record<AbaAprovacao, string> = {
  pendentes: "data_conclusao",
  reprovadas: "updated_at",
  aprovadas: "data_aprovacao",
};

export default function AprovacoesPendentes() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [filtroPeriodo, setFiltroPeriodo] = useState<FiltroPeriodo>("semana");
  const [abaAtiva, setAbaAtiva] = useState<AbaAprovacao>("pendentes");
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectComment, setRejectComment] = useState("");
  const [filtroCrianca, setFiltroCrianca] = useState<string>("todas");

  const now = new Date();
  const dateRange = useMemo(() => {
    if (filtroPeriodo === "dia") return { start: startOfDay(now), end: endOfDay(now) };
    if (filtroPeriodo === "semana") return { start: startOfWeek(now, { locale: ptBR }), end: endOfWeek(now, { locale: ptBR }) };
    return { start: startOfMonth(now), end: endOfMonth(now) };
  }, [filtroPeriodo]);

  const { data: criancas } = useQuery({
    queryKey: ["criancas-familia", profile?.familia_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles").select("*")
        .eq("familia_id", profile!.familia_id)
        .eq("tipo_perfil", "crianca");
      if (error) throw error;
      return data as Profile[];
    },
    enabled: !!profile,
  });

  const fetchTarefas = async (aba: AbaAprovacao) => {
    const statuses = statusMap[aba];
    const field = dateField[aba];
    const query = supabase
      .from("tarefa")
      .select("*")
      .eq("familia_id", profile!.familia_id)
      .in("status", statuses)
      .gte(field, dateRange.start.toISOString())
      .lte(field, dateRange.end.toISOString())
      .order(field, { ascending: false });
    const { data, error } = await query;
    if (error) throw error;
    return data as Tarefa[];
  };

  const { data: tarefasPendentes, isLoading: loadingPendentes } = useQuery({
    queryKey: ["aprovacoes", "pendentes", profile?.familia_id, filtroPeriodo],
    queryFn: () => fetchTarefas("pendentes"),
    enabled: !!profile,
  });

  const { data: tarefasReprovadas, isLoading: loadingReprovadas } = useQuery({
    queryKey: ["aprovacoes", "reprovadas", profile?.familia_id, filtroPeriodo],
    queryFn: () => fetchTarefas("reprovadas"),
    enabled: !!profile,
  });

  const { data: tarefasAprovadas, isLoading: loadingAprovadas } = useQuery({
    queryKey: ["aprovacoes", "aprovadas", profile?.familia_id, filtroPeriodo],
    queryFn: () => fetchTarefas("aprovadas"),
    enabled: !!profile,
  });

  const getCriancaNome = (userId: string | null) => {
    if (!userId) return "Sem atribuição";
    return criancas?.find(c => c.user_id === userId)?.nome ?? "Criança";
  };

  const aprovarTarefa = useMutation({
    mutationFn: async (tarefaId: string) => {
      const tarefa = tarefasPendentes?.find(t => t.id === tarefaId);
      if (!tarefa || !tarefa.atribuida_a) throw new Error("Tarefa inválida");

      const { error: taskError } = await supabase
        .from("tarefa")
        .update({ status: "concluida", data_aprovacao: new Date().toISOString() })
        .eq("id", tarefaId);
      if (taskError) throw taskError;

      const { data: saldoAtual } = await supabase.rpc("calcular_saldo", { _user_id: tarefa.atribuida_a });
      const anterior = (saldoAtual as number) ?? 0;

      const { error: txError } = await supabase.from("transacao").insert({
        user_id: tarefa.atribuida_a,
        familia_id: profile!.familia_id,
        tipo: "ganho_tarefa",
        quantidade_moedas: tarefa.valor_moedas,
        saldo_anterior: anterior,
        saldo_posterior: anterior + tarefa.valor_moedas,
        referencia_id: tarefaId,
        descricao: `Tarefa: ${tarefa.nome}`,
      });
      if (txError) throw txError;

      await supabase.from("profiles")
        .update({ saldo_moedas: anterior + tarefa.valor_moedas })
        .eq("user_id", tarefa.atribuida_a);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["aprovacoes"] });
      queryClient.invalidateQueries({ queryKey: ["responsavel-stats"] });
      toast({ title: "Tarefa aprovada! 🎉", description: "Moedas creditadas." });
    },
    onError: () => toast({ title: "Erro ao aprovar", variant: "destructive" }),
  });

  const rejeitarTarefa = useMutation({
    mutationFn: async ({ tarefaId, comentario }: { tarefaId: string; comentario: string }) => {
      const { error } = await supabase.from("tarefa")
        .update({ status: "rejeitada" as StatusTarefa, comentario_responsavel: comentario || null })
        .eq("id", tarefaId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["aprovacoes"] });
      queryClient.invalidateQueries({ queryKey: ["responsavel-stats"] });
      toast({ title: "Tarefa devolvida para a criança" });
      setRejectId(null);
      setRejectComment("");
    },
    onError: () => toast({ title: "Erro ao rejeitar", variant: "destructive" }),
  });

  const aceitarDispensa = useMutation({
    mutationFn: async (tarefaId: string) => {
      const { error } = await supabase.from("tarefa")
        .update({ status: "arquivada" as StatusTarefa, comentario_responsavel: "Dispensa aceita" })
        .eq("id", tarefaId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["aprovacoes"] });
      queryClient.invalidateQueries({ queryKey: ["responsavel-stats"] });
      toast({ title: "Dispensa aceita ✅" });
    },
    onError: () => toast({ title: "Erro", variant: "destructive" }),
  });

  const recusarDispensa = useMutation({
    mutationFn: async ({ tarefaId, comentario }: { tarefaId: string; comentario: string }) => {
      const { error } = await supabase.from("tarefa")
        .update({ status: "a_fazer" as StatusTarefa, comentario_responsavel: comentario || "Dispensa negada", justificativa: null })
        .eq("id", tarefaId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["aprovacoes"] });
      queryClient.invalidateQueries({ queryKey: ["responsavel-stats"] });
      toast({ title: "Dispensa negada - tarefa devolvida" });
      setRejectId(null);
      setRejectComment("");
    },
    onError: () => toast({ title: "Erro", variant: "destructive" }),
  });

  const periodoLabels: Record<FiltroPeriodo, string> = {
    dia: "Hoje",
    semana: "Esta semana",
    mes: "Este mês",
  };

  const renderTarefaCard = (tarefa: Tarefa, i: number, showActions: boolean) => (
    <motion.div key={tarefa.id} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
      <Card className="border-2 transition-shadow hover:shadow-md">
        <CardContent className="flex items-center gap-3 py-3">
          <div className="text-xl">{categoriasEmoji[tarefa.categoria] ?? "⭐"}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-display font-semibold text-sm truncate">{tarefa.nome}</span>
              {tarefa.status === "pendente_aprovacao" && <Badge variant="secondary" className="text-[10px]">Pendente</Badge>}
              {tarefa.status === "dispensa_solicitada" && <Badge variant="outline" className="text-[10px] border-yellow-500 text-yellow-600">Dispensa</Badge>}
              {tarefa.status === "rejeitada" && <Badge variant="destructive" className="text-[10px]">Reprovada</Badge>}
              {tarefa.status === "concluida" && <Badge className="text-[10px] bg-primary/20 text-primary border-primary/30">Aprovada</Badge>}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
              <span className="flex items-center gap-0.5 font-semibold text-coin-foreground">
                <Coins className="h-3 w-3 text-coin" /> {tarefa.valor_moedas}
              </span>
              <span>→ {getCriancaNome(tarefa.atribuida_a)}</span>
              {tarefa.data_conclusao && (
                <span>• {format(new Date(tarefa.data_conclusao), "dd/MM HH:mm")}</span>
              )}
              {tarefa.status === "rejeitada" && tarefa.comentario_responsavel && (
                <span className="text-destructive italic">"{tarefa.comentario_responsavel}"</span>
              )}
              {tarefa.justificativa && (
                <span className="italic text-foreground/70">📝 "{tarefa.justificativa}"</span>
              )}
            </div>
          </div>
          {showActions && (
            <div className="flex items-center gap-1 shrink-0">
              {tarefa.status === "dispensa_solicitada" ? (
                <>
                  <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => aceitarDispensa.mutate(tarefa.id)} disabled={aceitarDispensa.isPending}>
                    <CheckCircle2 className="h-4 w-4 text-primary mr-1" /> Aceitar
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setRejectId(tarefa.id)}>
                    <XCircle className="h-4 w-4 text-destructive mr-1" /> Negar
                  </Button>
                </>
              ) : (
                <>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => aprovarTarefa.mutate(tarefa.id)} disabled={aprovarTarefa.isPending}>
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setRejectId(tarefa.id)}>
                    <XCircle className="h-5 w-5 text-destructive" />
                  </Button>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );

  const renderEmpty = (msg: string) => (
    <Card className="border-dashed border-2">
      <CardContent className="flex flex-col items-center justify-center py-8 text-center">
        <CheckCircle2 className="mb-3 h-10 w-10 text-muted-foreground/50" />
        <p className="font-display font-semibold">{msg}</p>
        <p className="text-sm text-muted-foreground">{periodoLabels[filtroPeriodo]}</p>
      </CardContent>
    </Card>
  );

  const renderLoading = () => (
    <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
  );

  const filterByCrianca = (tarefas: Tarefa[] | undefined) => {
    if (!tarefas) return [];
    if (filtroCrianca === "todas") return tarefas;
    return tarefas.filter(t => t.atribuida_a === filtroCrianca);
  };

  const filteredPendentes = filterByCrianca(tarefasPendentes);
  const filteredReprovadas = filterByCrianca(tarefasReprovadas);
  const filteredAprovadas = filterByCrianca(tarefasAprovadas);

  const pendentesCount = filteredPendentes.length;
  const reprovadasCount = filteredReprovadas.length;
  const aprovadasCount = filteredAprovadas.length;

  return (
    <AppLayout>
      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-display text-2xl font-bold md:text-3xl">Aprovações ✅</h1>
          <p className="text-muted-foreground">Gerencie as tarefas concluídas pelas crianças</p>
        </motion.div>

        <div className="flex items-center gap-2 flex-wrap">
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
          <User className="h-4 w-4 text-muted-foreground ml-2" />
          <Select value={filtroCrianca} onValueChange={setFiltroCrianca}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as crianças</SelectItem>
              {criancas?.map(c => (
                <SelectItem key={c.user_id} value={c.user_id}>{c.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Tabs value={abaAtiva} onValueChange={(v) => setAbaAtiva(v as AbaAprovacao)}>
          <TabsList className="w-full">
            <TabsTrigger value="pendentes" className="flex-1 gap-1">
              Pendentes {pendentesCount > 0 && <Badge variant="secondary" className="text-[10px] ml-1">{pendentesCount}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="reprovadas" className="flex-1 gap-1">
              Reprovadas {reprovadasCount > 0 && <Badge variant="destructive" className="text-[10px] ml-1">{reprovadasCount}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="aprovadas" className="flex-1 gap-1">
              Aprovadas {aprovadasCount > 0 && <Badge className="text-[10px] ml-1 bg-primary/20 text-primary border-primary/30">{aprovadasCount}</Badge>}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pendentes" className="space-y-2 mt-4">
            {loadingPendentes ? renderLoading() : !filteredPendentes.length ? renderEmpty("Nenhuma aprovação pendente") : (
              <AnimatePresence>
                {filteredPendentes.map((t, i) => renderTarefaCard(t, i, true))}
              </AnimatePresence>
            )}
          </TabsContent>

          <TabsContent value="reprovadas" className="space-y-2 mt-4">
            {loadingReprovadas ? renderLoading() : !filteredReprovadas.length ? renderEmpty("Nenhuma tarefa reprovada") : (
              <AnimatePresence>
                {filteredReprovadas.map((t, i) => renderTarefaCard(t, i, false))}
              </AnimatePresence>
            )}
          </TabsContent>

          <TabsContent value="aprovadas" className="space-y-2 mt-4">
            {loadingAprovadas ? renderLoading() : !filteredAprovadas.length ? renderEmpty("Nenhuma tarefa aprovada") : (
              <AnimatePresence>
                {filteredAprovadas.map((t, i) => renderTarefaCard(t, i, false))}
              </AnimatePresence>
            )}
          </TabsContent>
        </Tabs>

        {/* Reject / Deny dialog */}
        <Dialog open={!!rejectId} onOpenChange={(o) => { if (!o) { setRejectId(null); setRejectComment(""); } }}>
          <DialogContent>
            {(() => {
              const isDispensa = tarefasPendentes?.find(t => t.id === rejectId)?.status === "dispensa_solicitada";
              return (
                <>
                  <DialogHeader>
                    <DialogTitle className="font-display">{isDispensa ? "Negar Dispensa" : "Devolver Tarefa"}</DialogTitle>
                  </DialogHeader>
                  <div>
                    <Label>{isDispensa ? "Mensagem para a criança (opcional)" : "Mensagem para o filho (opcional)"}</Label>
                    <Textarea placeholder={isDispensa ? "Explique por que a dispensa não foi aceita..." : "Explique o motivo da devolução..."} value={rejectComment} onChange={e => setRejectComment(e.target.value)} />
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => { setRejectId(null); setRejectComment(""); }}>Cancelar</Button>
                    <Button
                      variant="destructive"
                      onClick={() => {
                        if (!rejectId) return;
                        if (isDispensa) {
                          recusarDispensa.mutate({ tarefaId: rejectId, comentario: rejectComment });
                        } else {
                          rejeitarTarefa.mutate({ tarefaId: rejectId, comentario: rejectComment });
                        }
                      }}
                      disabled={rejeitarTarefa.isPending || recusarDispensa.isPending}
                    >
                      {(rejeitarTarefa.isPending || recusarDispensa.isPending) ? <Loader2 className="h-4 w-4 animate-spin" /> : isDispensa ? "Negar" : "Devolver"}
                    </Button>
                  </DialogFooter>
                </>
              );
            })()}
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
