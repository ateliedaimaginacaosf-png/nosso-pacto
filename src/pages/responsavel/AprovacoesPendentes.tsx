import { useAuth } from "@/contexts/AuthContext";
import { useSelectedChild } from "@/contexts/SelectedChildContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, CheckCircle2, XCircle, Coins, Filter, User, Undo2, Star } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { InteracaoInput } from "@/components/InteracaoInput";
import { TarefaHistoricoSheet } from "@/components/TarefaHistoricoSheet";
import { salvarInteracao } from "@/lib/interacao";
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

const categoriasLabel: Record<string, string> = {
  limpeza: "Limpeza", estudos: "Estudos", exercicio: "Exercício", higiene: "Higiene",
  alimentacao: "Alimentação", organizacao: "Organização", outros: "Outros",
};

type FiltroPeriodo = "dia" | "semana" | "mes";
type AbaAprovacao = "pendentes" | "reprovadas" | "aprovadas";
type StatusTarefa = "a_fazer" | "pendente_aprovacao" | "concluida" | "rejeitada" | "arquivada" | "dispensa_solicitada";

const statusMap: Record<AbaAprovacao, StatusTarefa[]> = {
  pendentes: ["pendente_aprovacao", "dispensa_solicitada"],
  reprovadas: ["rejeitada"],
  aprovadas: ["concluida", "arquivada"],
};

const dateField: Record<AbaAprovacao, string> = {
  pendentes: "data_conclusao",
  reprovadas: "updated_at",
  aprovadas: "data_aprovacao",
};

type DialogAction = {
  type: "aprovar" | "rejeitar" | "aceitar_dispensa" | "negar_dispensa" | "reverter_aprovacao" | "reverter_rejeicao";
  tarefaId: string;
  tarefa?: Tarefa;
};

export default function AprovacoesPendentes() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [filtroPeriodo, setFiltroPeriodo] = useState<FiltroPeriodo>("semana");
  const [abaAtiva, setAbaAtiva] = useState<AbaAprovacao>("pendentes");
  const { selectedChildId: filtroCrianca, setSelectedChildId: setFiltroCrianca } = useSelectedChild();

  // Unified dialog state
  const [dialogAction, setDialogAction] = useState<DialogAction | null>(null);
  const [selectedTarefa, setSelectedTarefa] = useState<Tarefa | null>(null);
  const [dialogMensagem, setDialogMensagem] = useState("");
  const [dialogFoto, setDialogFoto] = useState<File | null>(null);

  // Extra task editing state
  const [extraCategoria, setExtraCategoria] = useState("outros");
  const [extraMoedas, setExtraMoedas] = useState("5");

  const closeDialog = () => {
    setDialogAction(null);
    setDialogMensagem("");
    setDialogFoto(null);
    setExtraCategoria("outros");
    setExtraMoedas("5");
  };

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
    let query = supabase
      .from("tarefa")
      .select("*")
      .eq("familia_id", profile!.familia_id)
      .in("status", statuses);

    if (aba === "pendentes") {
      query = query.order("updated_at", { ascending: false });
    } else {
      const field = dateField[aba];
      query = query
        .gte(field, dateRange.start.toISOString())
        .lte(field, dateRange.end.toISOString())
        .order(field, { ascending: false });
    }

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

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["aprovacoes"] });
    queryClient.invalidateQueries({ queryKey: ["responsavel-stats"] });
    queryClient.invalidateQueries({ queryKey: ["crianca"] });
  };

  const actionMutation = useMutation({
    mutationFn: async ({ action, mensagem, foto, extraEdit }: { action: DialogAction; mensagem: string; foto: File | null; extraEdit?: { categoria: string; valor_moedas: number } }) => {
      const { type, tarefaId } = action;
      const tarefa = action.tarefa ?? tarefasPendentes?.find(t => t.id === tarefaId) ?? filteredAprovadas?.find(t => t.id === tarefaId) ?? filteredReprovadas?.find(t => t.id === tarefaId);

      if (!tarefa) throw new Error("Tarefa não encontrada");

      const statusAnterior = tarefa.status;

      if (type === "aprovar") {
        if (!tarefa.atribuida_a) throw new Error("Tarefa sem atribuição");

        // If extra task, update category and coins first
        const valorMoedas = extraEdit ? extraEdit.valor_moedas : tarefa.valor_moedas;
        const updateData: Record<string, unknown> = {
          status: "concluida",
          data_aprovacao: new Date().toISOString(),
          comentario_responsavel: mensagem || null,
        };
        if (extraEdit) {
          updateData.categoria = extraEdit.categoria;
          updateData.valor_moedas = extraEdit.valor_moedas;
        }

        const { error: taskError } = await supabase
          .from("tarefa")
          .update(updateData)
          .eq("id", tarefaId);
        if (taskError) throw taskError;

        const { data: saldoAtual } = await supabase.rpc("calcular_saldo", { _user_id: tarefa.atribuida_a });
        const anterior = (saldoAtual as number) ?? 0;

        const { error: txError } = await supabase.from("transacao").insert({
          user_id: tarefa.atribuida_a,
          familia_id: profile!.familia_id,
          tipo: "ganho_tarefa",
          quantidade_moedas: valorMoedas,
          saldo_anterior: anterior,
          saldo_posterior: anterior + valorMoedas,
          referencia_id: tarefaId,
          descricao: `Tarefa: ${tarefa.nome}`,
        });
        if (txError) throw txError;

        await supabase.from("profiles")
          .update({ saldo_moedas: anterior + valorMoedas })
          .eq("user_id", tarefa.atribuida_a);

        await salvarInteracao({ tarefaId, familiaId: profile!.familia_id, userId: profile!.user_id, statusAnterior, statusNovo: "concluida", mensagem, foto });
      }

      if (type === "rejeitar") {
        const { error } = await supabase.from("tarefa")
          .update({ status: "rejeitada" as StatusTarefa, comentario_responsavel: mensagem || null })
          .eq("id", tarefaId);
        if (error) throw error;

        await salvarInteracao({ tarefaId, familiaId: profile!.familia_id, userId: profile!.user_id, statusAnterior, statusNovo: "rejeitada", mensagem, foto });
      }

      if (type === "aceitar_dispensa") {
        const { error } = await supabase.from("tarefa")
          .update({ status: "arquivada" as StatusTarefa, comentario_responsavel: mensagem || "Dispensa aceita", data_aprovacao: new Date().toISOString() })
          .eq("id", tarefaId);
        if (error) throw error;

        await salvarInteracao({ tarefaId, familiaId: profile!.familia_id, userId: profile!.user_id, statusAnterior, statusNovo: "arquivada", mensagem: mensagem || "Dispensa aceita", foto });
      }

      if (type === "negar_dispensa") {
        const { error } = await supabase.from("tarefa")
          .update({ status: "a_fazer" as StatusTarefa, comentario_responsavel: mensagem || "Dispensa negada", justificativa: null })
          .eq("id", tarefaId);
        if (error) throw error;

        await salvarInteracao({ tarefaId, familiaId: profile!.familia_id, userId: profile!.user_id, statusAnterior, statusNovo: "a_fazer", mensagem: mensagem || "Dispensa negada", foto });
      }

      if (type === "reverter_aprovacao") {
        if (!tarefa.atribuida_a) throw new Error("Tarefa sem atribuição");

        if (tarefa.status === "concluida") {
          const { data: saldoAtual } = await supabase.rpc("calcular_saldo", { _user_id: tarefa.atribuida_a });
          const anterior = (saldoAtual as number) ?? 0;
          const novoSaldo = anterior - tarefa.valor_moedas;

          const { error: txError } = await supabase.from("transacao").insert({
            user_id: tarefa.atribuida_a,
            familia_id: profile!.familia_id,
            tipo: "reversao",
            quantidade_moedas: -tarefa.valor_moedas,
            saldo_anterior: anterior,
            saldo_posterior: novoSaldo,
            referencia_id: tarefaId,
            descricao: `Reversão: ${tarefa.nome}`,
          });
          if (txError) throw txError;

          await supabase.from("profiles")
            .update({ saldo_moedas: novoSaldo })
            .eq("user_id", tarefa.atribuida_a);

          const { error } = await supabase.from("tarefa")
            .update({ status: "pendente_aprovacao" as StatusTarefa, data_aprovacao: null, comentario_responsavel: mensagem || null })
            .eq("id", tarefaId);
          if (error) throw error;
        } else if (tarefa.status === "arquivada") {
          const { error } = await supabase.from("tarefa")
            .update({ status: "dispensa_solicitada" as StatusTarefa, data_aprovacao: null, comentario_responsavel: mensagem || null })
            .eq("id", tarefaId);
          if (error) throw error;
        }

        await salvarInteracao({ tarefaId, familiaId: profile!.familia_id, userId: profile!.user_id, statusAnterior, statusNovo: tarefa.status === "concluida" ? "pendente_aprovacao" : "dispensa_solicitada", mensagem, foto });
      }

      if (type === "reverter_rejeicao") {
        const { error } = await supabase.from("tarefa")
          .update({ status: "pendente_aprovacao" as StatusTarefa, comentario_responsavel: mensagem || null })
          .eq("id", tarefaId);
        if (error) throw error;

        await salvarInteracao({ tarefaId, familiaId: profile!.familia_id, userId: profile!.user_id, statusAnterior, statusNovo: "pendente_aprovacao", mensagem, foto });
      }
    },
    onSuccess: (_, vars) => {
      invalidateAll();
      const msgs: Record<string, string> = {
        aprovar: "Tarefa aprovada! 🎉",
        rejeitar: "Tarefa devolvida para a criança",
        aceitar_dispensa: "Dispensa aceita ✅",
        negar_dispensa: "Dispensa negada - tarefa devolvida",
        reverter_aprovacao: "Decisão revertida ↩️",
        reverter_rejeicao: "Rejeição revertida ↩️",
      };
      toast({ title: msgs[vars.action.type] ?? "Ação realizada" });
      closeDialog();
    },
    onError: () => {
      toast({ title: "Erro ao executar ação", variant: "destructive" });
    },
  });

  const openDialog = (type: DialogAction["type"], tarefaId: string, tarefa?: Tarefa) => {
    setDialogAction({ type, tarefaId, tarefa });
    setDialogMensagem("");
    setDialogFoto(null);
    // Pre-fill extra task fields
    if (tarefa?.tarefa_extra) {
      setExtraCategoria(tarefa.categoria);
      setExtraMoedas(String(tarefa.valor_moedas));
    } else {
      setExtraCategoria("outros");
      setExtraMoedas("5");
    }
  };

  const periodoLabels: Record<FiltroPeriodo, string> = {
    dia: "Hoje",
    semana: "Esta semana",
    mes: "Este mês",
  };

  const dialogConfig: Record<string, { title: string; label: string; placeholder: string; btnLabel: string; btnVariant?: "destructive" | "default" }> = {
    aprovar: { title: "Aprovar Tarefa ✅", label: "Mensagem para a criança (opcional)", placeholder: "Parabéns! Muito bem...", btnLabel: "Aprovar" },
    rejeitar: { title: "Devolver Tarefa", label: "Mensagem para a criança (opcional)", placeholder: "Explique o motivo da devolução...", btnLabel: "Devolver", btnVariant: "destructive" },
    aceitar_dispensa: { title: "Aceitar Dispensa ✅", label: "Mensagem (opcional)", placeholder: "Tudo bem, entendo...", btnLabel: "Aceitar Dispensa" },
    negar_dispensa: { title: "Negar Dispensa", label: "Mensagem para a criança (opcional)", placeholder: "Explique por que a dispensa não foi aceita...", btnLabel: "Negar", btnVariant: "destructive" },
    reverter_aprovacao: { title: "Reverter Decisão ↩️", label: "Motivo da reversão (opcional)", placeholder: "Explique por que está revertendo...", btnLabel: "Reverter" },
    reverter_rejeicao: { title: "Reverter Rejeição ↩️", label: "Motivo da reversão (opcional)", placeholder: "Explique por que está revertendo...", btnLabel: "Reverter" },
  };

  const renderTarefaCard = (tarefa: Tarefa, i: number, actionType: "approve" | "revert-approve" | "revert-reject" | "none") => (
    <motion.div key={tarefa.id} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
      <Card className="border-2 transition-shadow hover:shadow-md">
        <CardContent className="flex items-center gap-3 py-3">
          <div className="text-xl cursor-pointer" onClick={() => setSelectedTarefa(tarefa)}>{categoriasEmoji[tarefa.categoria] ?? "⭐"}</div>
          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setSelectedTarefa(tarefa)}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-display font-semibold text-sm truncate">{tarefa.nome}</span>
              {tarefa.status === "pendente_aprovacao" && <Badge variant="secondary" className="text-[10px]">Pendente</Badge>}
              {tarefa.status === "dispensa_solicitada" && <Badge variant="outline" className="text-[10px] border-yellow-500 text-yellow-600">Dispensa</Badge>}
              {tarefa.status === "rejeitada" && <Badge variant="destructive" className="text-[10px]">Reprovada</Badge>}
              {tarefa.status === "concluida" && <Badge className="text-[10px] bg-primary/20 text-primary border-primary/30">Aprovada</Badge>}
              {tarefa.status === "arquivada" && <Badge variant="outline" className="text-[10px] border-muted-foreground/50 text-muted-foreground">Dispensada</Badge>}
              {tarefa.tarefa_extra && <Badge variant="outline" className="text-[10px] border-accent text-accent-foreground"><Star className="h-2.5 w-2.5 mr-0.5" />Extra</Badge>}
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
          {actionType === "approve" && (
            <div className="flex items-center gap-1 shrink-0">
              {tarefa.status === "dispensa_solicitada" ? (
                <>
                  <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => openDialog("aceitar_dispensa", tarefa.id, tarefa)}>
                    <CheckCircle2 className="h-4 w-4 text-primary mr-1" /> Aceitar
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => openDialog("negar_dispensa", tarefa.id, tarefa)}>
                    <XCircle className="h-4 w-4 text-destructive mr-1" /> Negar
                  </Button>
                </>
              ) : (
                <>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openDialog("aprovar", tarefa.id, tarefa)}>
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openDialog("rejeitar", tarefa.id, tarefa)}>
                    <XCircle className="h-5 w-5 text-destructive" />
                  </Button>
                </>
              )}
            </div>
          )}
          {actionType === "revert-approve" && (
            <Button size="sm" variant="ghost" className="h-8 text-xs shrink-0" onClick={() => openDialog("reverter_aprovacao", tarefa.id, tarefa)}>
              <Undo2 className="h-4 w-4 mr-1" /> Reverter
            </Button>
          )}
          {actionType === "revert-reject" && (
            <Button size="sm" variant="ghost" className="h-8 text-xs shrink-0" onClick={() => openDialog("reverter_rejeicao", tarefa.id, tarefa)}>
              <Undo2 className="h-4 w-4 mr-1" /> Reverter
            </Button>
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
    if (filtroCrianca === "todos") return tarefas;
    return tarefas.filter(t => t.atribuida_a === filtroCrianca);
  };

  const filteredPendentes = filterByCrianca(tarefasPendentes);
  const filteredReprovadas = filterByCrianca(tarefasReprovadas);
  const filteredAprovadas = filterByCrianca(tarefasAprovadas);

  const pendentesCount = filteredPendentes.length;
  const reprovadasCount = filteredReprovadas.length;
  const aprovadasCount = filteredAprovadas.length;

  const currentConfig = dialogAction ? dialogConfig[dialogAction.type] : null;

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
              <SelectItem value="todos">Todas as crianças</SelectItem>
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
                {filteredPendentes.map((t, i) => renderTarefaCard(t, i, "approve"))}
              </AnimatePresence>
            )}
          </TabsContent>

          <TabsContent value="reprovadas" className="space-y-2 mt-4">
            {loadingReprovadas ? renderLoading() : !filteredReprovadas.length ? renderEmpty("Nenhuma tarefa reprovada") : (
              <AnimatePresence>
                {filteredReprovadas.map((t, i) => renderTarefaCard(t, i, "revert-reject"))}
              </AnimatePresence>
            )}
          </TabsContent>

          <TabsContent value="aprovadas" className="space-y-2 mt-4">
            {loadingAprovadas ? renderLoading() : !filteredAprovadas.length ? renderEmpty("Nenhuma tarefa aprovada") : (
              <AnimatePresence>
                {filteredAprovadas.map((t, i) => renderTarefaCard(t, i, "revert-approve"))}
              </AnimatePresence>
            )}
          </TabsContent>
        </Tabs>

        {/* Unified action dialog with text + photo */}
        <Dialog open={!!dialogAction} onOpenChange={(o) => { if (!o) closeDialog(); }}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            {currentConfig && (
              <>
                <DialogHeader>
                  <DialogTitle className="font-display">{currentConfig.title}</DialogTitle>
                </DialogHeader>

                {/* Extra task editing fields for approval */}
                {dialogAction?.type === "aprovar" && dialogAction.tarefa?.tarefa_extra && (
                  <div className="space-y-3 rounded-lg border-2 border-accent/30 bg-accent/5 p-3">
                    <p className="text-xs font-semibold flex items-center gap-1"><Star className="h-3.5 w-3.5" /> Tarefa Extra — defina a categoria e moedas</p>
                    <div className="space-y-1">
                      <p className="text-sm font-medium">{dialogAction.tarefa.nome}</p>
                      {dialogAction.tarefa.descricao && (
                        <p className="text-xs text-muted-foreground">{dialogAction.tarefa.descricao}</p>
                      )}
                      {dialogAction.tarefa.justificativa && (
                        <p className="text-xs italic text-foreground/70">📝 "{dialogAction.tarefa.justificativa}"</p>
                      )}
                      <p className="text-xs text-muted-foreground">Por: {getCriancaNome(dialogAction.tarefa.atribuida_a)}</p>
                    </div>
                    <div>
                      <Label>Categoria</Label>
                      <Select value={extraCategoria} onValueChange={setExtraCategoria}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(categoriasLabel).map(([k, v]) => (
                            <SelectItem key={k} value={k}>{categoriasEmoji[k]} {v}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Moedas</Label>
                      <Input type="number" min="0" value={extraMoedas} onChange={e => setExtraMoedas(e.target.value)} />
                    </div>
                  </div>
                )}

                <InteracaoInput
                  label={currentConfig.label}
                  placeholder={currentConfig.placeholder}
                  mensagem={dialogMensagem}
                  onMensagemChange={setDialogMensagem}
                  foto={dialogFoto}
                  onFotoChange={setDialogFoto}
                />
                <DialogFooter>
                  <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
                  <Button
                    variant={currentConfig.btnVariant ?? "default"}
                    onClick={() => {
                      if (!dialogAction) return;
                      const isExtraApproval = dialogAction.type === "aprovar" && dialogAction.tarefa?.tarefa_extra;
                      actionMutation.mutate({
                        action: dialogAction,
                        mensagem: dialogMensagem,
                        foto: dialogFoto,
                        extraEdit: isExtraApproval ? { categoria: extraCategoria, valor_moedas: parseInt(extraMoedas) || 0 } : undefined,
                      });
                    }}
                    disabled={actionMutation.isPending}
                  >
                    {actionMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : currentConfig.btnLabel}
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Task History Sheet */}
        <TarefaHistoricoSheet
          tarefa={selectedTarefa}
          onClose={() => setSelectedTarefa(null)}
          getNomeUsuario={getCriancaNome}
        />
      </div>
    </AppLayout>
  );
}
