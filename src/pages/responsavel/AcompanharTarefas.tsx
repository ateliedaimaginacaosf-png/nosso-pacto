import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useSelectedChild } from "@/contexts/SelectedChildContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { TarefaHistoricoSheet } from "@/components/TarefaHistoricoSheet";
import { InteracaoInput } from "@/components/InteracaoInput";
import { salvarInteracao } from "@/lib/interacao";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, CheckCircle2, Clock, AlertTriangle, Archive, ClipboardList, Coins, XCircle, Undo2, Star, Search } from "lucide-react";
import { motion } from "framer-motion";
import { format, startOfWeek, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

type Tarefa = Tables<"tarefa">;
type Profile = Tables<"profiles">;
type StatusTarefa = "a_fazer" | "pendente_aprovacao" | "concluida" | "rejeitada" | "arquivada" | "dispensa_solicitada";

type Periodo = "hoje" | "semana" | "mes";
type StatusFiltro = "todos" | "a_fazer" | "nao_feita" | "pendente_aprovacao" | "concluida" | "rejeitada" | "dispensa_solicitada" | "arquivada";

const statusConfig: Record<string, { label: string; icon: typeof CheckCircle2; color: string; badgeVariant: "default" | "secondary" | "destructive" | "outline" }> = {
  a_fazer: { label: "A fazer", icon: ClipboardList, color: "text-primary", badgeVariant: "default" },
  nao_feita: { label: "Não feita", icon: XCircle, color: "text-muted-foreground", badgeVariant: "destructive" },
  pendente_aprovacao: { label: "Em validação", icon: Clock, color: "text-yellow-600", badgeVariant: "outline" },
  concluida: { label: "Concluída", icon: CheckCircle2, color: "text-success", badgeVariant: "secondary" },
  rejeitada: { label: "Rejeitada", icon: AlertTriangle, color: "text-destructive", badgeVariant: "destructive" },
  dispensa_solicitada: { label: "Dispensa", icon: Clock, color: "text-orange-500", badgeVariant: "outline" },
  arquivada: { label: "Dispensada", icon: Archive, color: "text-muted-foreground", badgeVariant: "outline" },
};

const categoriasEmoji: Record<string, string> = {
  limpeza: "🧹", estudos: "📚", exercicio: "🏃", higiene: "🧼",
  alimentacao: "🍎", organizacao: "📦", outros: "⭐",
};

const categoriasLabel: Record<string, string> = {
  limpeza: "Limpeza", estudos: "Estudos", exercicio: "Exercício", higiene: "Higiene",
  alimentacao: "Alimentação", organizacao: "Organização", outros: "Outros",
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

type DialogAction = {
  type: "aprovar" | "rejeitar" | "aceitar_dispensa" | "negar_dispensa" | "reverter_aprovacao" | "reverter_rejeicao";
  tarefaId: string;
  tarefa?: Tarefa;
};

export default function AcompanharTarefas() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [periodo, setPeriodo] = useState<Periodo>("hoje");
  const { selectedChildId: criancaId, setSelectedChildId: setCriancaId } = useSelectedChild();
  const [statusFiltro, setStatusFiltro] = useState<StatusFiltro>("todos");
  const [selectedTarefa, setSelectedTarefa] = useState<Tarefa | null>(null);
  const [buscaTexto, setBuscaTexto] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("todas");

  // Dialog state
  const [dialogAction, setDialogAction] = useState<DialogAction | null>(null);
  const [dialogMensagem, setDialogMensagem] = useState("");
  const [dialogFoto, setDialogFoto] = useState<File | null>(null);
  const [extraCategoria, setExtraCategoria] = useState("outros");
  const [extraMoedas, setExtraMoedas] = useState("5");

  const closeDialog = () => {
    setDialogAction(null);
    setDialogMensagem("");
    setDialogFoto(null);
    setExtraCategoria("outros");
    setExtraMoedas("5");
  };

  const openDialog = (type: DialogAction["type"], tarefaId: string, tarefa?: Tarefa) => {
    setDialogAction({ type, tarefaId, tarefa });
    setDialogMensagem("");
    setDialogFoto(null);
    if (tarefa?.tarefa_extra) {
      setExtraCategoria(tarefa.categoria);
      setExtraMoedas(String(tarefa.valor_moedas));
    } else {
      setExtraCategoria("outros");
      setExtraMoedas("5");
    }
  };

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

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["acompanhar-tarefas"] });
    queryClient.invalidateQueries({ queryKey: ["aprovacoes"] });
    queryClient.invalidateQueries({ queryKey: ["responsavel-stats"] });
    queryClient.invalidateQueries({ queryKey: ["crianca"] });
  };

  const actionMutation = useMutation({
    mutationFn: async ({ action, mensagem, foto, extraEdit }: { action: DialogAction; mensagem: string; foto: File | null; extraEdit?: { categoria: string; valor_moedas: number } }) => {
      const { type, tarefaId } = action;
      const tarefa = action.tarefa ?? tarefas?.find(t => t.id === tarefaId);
      if (!tarefa) throw new Error("Tarefa não encontrada");

      const statusAnterior = tarefa.status;

      if (type === "aprovar") {
        if (!tarefa.atribuida_a) throw new Error("Tarefa sem atribuição");
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

        const { error: taskError } = await supabase.from("tarefa").update(updateData).eq("id", tarefaId);
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

        await supabase.from("profiles").update({ saldo_moedas: anterior + valorMoedas }).eq("user_id", tarefa.atribuida_a);
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

          await supabase.from("profiles").update({ saldo_moedas: novoSaldo }).eq("user_id", tarefa.atribuida_a);
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

  const filtradas = (tarefas ?? []).filter((t) => {
    const effective = getEffectiveStatus(t);
    if (statusFiltro !== "todos" && effective !== statusFiltro) return false;
    if (filtroCategoria !== "todas" && t.categoria !== filtroCategoria) return false;
    if (buscaTexto) {
      const search = buscaTexto.toLowerCase();
      if (!t.nome.toLowerCase().includes(search) && !(t.descricao ?? "").toLowerCase().includes(search)) return false;
    }
    return true;
  });

  // Calculate lost coins per child
  const naoFeitas = (tarefas ?? []).filter((t) => getEffectiveStatus(t) === "nao_feita");
  const moedasPerdidasPorCrianca = (criancas ?? []).map((c) => {
    const total = naoFeitas.filter((t) => t.atribuida_a === c.user_id).reduce((sum, t) => sum + t.valor_moedas, 0);
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

  const getActionButtons = (t: Tarefa) => {
    const effective = getEffectiveStatus(t);
    if (effective === "pendente_aprovacao") {
      return (
        <div className="flex items-center gap-1 shrink-0">
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); openDialog("aprovar", t.id, t); }}>
            <CheckCircle2 className="h-5 w-5 text-primary" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); openDialog("rejeitar", t.id, t); }}>
            <XCircle className="h-5 w-5 text-destructive" />
          </Button>
        </div>
      );
    }
    if (effective === "dispensa_solicitada") {
      return (
        <div className="flex items-center gap-1 shrink-0">
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={(e) => { e.stopPropagation(); openDialog("aceitar_dispensa", t.id, t); }}>
            <CheckCircle2 className="h-4 w-4 text-primary mr-1" /> Aceitar
          </Button>
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={(e) => { e.stopPropagation(); openDialog("negar_dispensa", t.id, t); }}>
            <XCircle className="h-4 w-4 text-destructive mr-1" /> Negar
          </Button>
        </div>
      );
    }
    if (effective === "concluida" || effective === "arquivada") {
      return (
        <Button size="sm" variant="ghost" className="h-8 text-xs shrink-0" onClick={(e) => { e.stopPropagation(); openDialog("reverter_aprovacao", t.id, t); }}>
          <Undo2 className="h-4 w-4 mr-1" /> Reverter
        </Button>
      );
    }
    if (effective === "rejeitada") {
      return (
        <Button size="sm" variant="ghost" className="h-8 text-xs shrink-0" onClick={(e) => { e.stopPropagation(); openDialog("reverter_rejeicao", t.id, t); }}>
          <Undo2 className="h-4 w-4 mr-1" /> Reverter
        </Button>
      );
    }
    return null;
  };

  const dialogConfig: Record<string, { title: string; label: string; placeholder: string; btnLabel: string; btnVariant?: "destructive" | "default" }> = {
    aprovar: { title: "Aprovar Tarefa ✅", label: "Mensagem para a criança (opcional)", placeholder: "Parabéns! Muito bem...", btnLabel: "Aprovar" },
    rejeitar: { title: "Devolver Tarefa", label: "Mensagem para a criança (opcional)", placeholder: "Explique o motivo da devolução...", btnLabel: "Devolver", btnVariant: "destructive" },
    aceitar_dispensa: { title: "Aceitar Dispensa ✅", label: "Mensagem (opcional)", placeholder: "Tudo bem, entendo...", btnLabel: "Aceitar Dispensa" },
    negar_dispensa: { title: "Negar Dispensa", label: "Mensagem para a criança (opcional)", placeholder: "Explique por que a dispensa não foi aceita...", btnLabel: "Negar", btnVariant: "destructive" },
    reverter_aprovacao: { title: "Reverter Decisão ↩️", label: "Motivo da reversão (opcional)", placeholder: "Explique por que está revertendo...", btnLabel: "Reverter" },
    reverter_rejeicao: { title: "Reverter Rejeição ↩️", label: "Motivo da reversão (opcional)", placeholder: "Explique por que está revertendo...", btnLabel: "Reverter" },
  };

  const currentConfig = dialogAction ? dialogConfig[dialogAction.type] : null;

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
              <SelectItem value="pendente_aprovacao">Em validação</SelectItem>
              <SelectItem value="concluida">Concluída</SelectItem>
              <SelectItem value="rejeitada">Rejeitada</SelectItem>
              <SelectItem value="dispensa_solicitada">Dispensa solicitada</SelectItem>
              <SelectItem value="arquivada">Dispensada</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas categorias</SelectItem>
              {Object.entries(categoriasLabel).map(([key, label]) => (
                <SelectItem key={key} value={key}>{categoriasEmoji[key]} {label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome ou descrição..." value={buscaTexto} onChange={e => setBuscaTexto(e.target.value)} className="pl-9" />
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
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold truncate">{t.nome}</p>
                          {t.tarefa_extra && (
                            <Badge variant="outline" className="text-xs border-accent text-accent-foreground bg-accent/20">
                              <Star className="h-2.5 w-2.5 mr-0.5" />Extra
                            </Badge>
                          )}
                          <Badge variant={cfg.badgeVariant} className="text-xs">
                            {cfg.label}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                          {effectiveStatus === "arquivada" || effectiveStatus === "dispensa_solicitada" || effectiveStatus === "nao_feita" ? (
                            <span className="text-muted-foreground/60 line-through">{t.valor_moedas} 🪙</span>
                          ) : (
                            <span className="font-medium text-coin">{t.valor_moedas} 🪙</span>
                          )}
                          <span>{getNomeCrianca(t.atribuida_a)}</span>
                          {t.data_prevista && (
                            <span>• {format(new Date(t.data_prevista + "T00:00:00"), "dd MMM", { locale: ptBR })}</span>
                          )}
                          {t.justificativa && (
                            <span className="italic text-foreground/70">📝 "{t.justificativa}"</span>
                          )}
                          {t.comentario_responsavel && effectiveStatus === "rejeitada" && (
                            <span className="text-destructive italic">💬 "{t.comentario_responsavel}"</span>
                          )}
                        </div>
                      </div>
                      {getActionButtons(t)}
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Action Dialog */}
        <Dialog open={!!dialogAction} onOpenChange={(o) => { if (!o) closeDialog(); }}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            {currentConfig && (
              <>
                <DialogHeader>
                  <DialogTitle className="font-display">{currentConfig.title}</DialogTitle>
                </DialogHeader>

                {dialogAction?.type === "aprovar" && dialogAction.tarefa?.tarefa_extra && (
                  <div className="space-y-3 rounded-lg border-2 border-accent/30 bg-accent/5 p-3">
                    <p className="text-xs font-semibold flex items-center gap-1"><Star className="h-3.5 w-3.5" /> Tarefa Extra — defina a categoria e moedas</p>
                    <div className="space-y-1">
                      <p className="text-sm font-medium">{dialogAction.tarefa.nome}</p>
                      {dialogAction.tarefa.descricao && <p className="text-xs text-muted-foreground">{dialogAction.tarefa.descricao}</p>}
                      {dialogAction.tarefa.justificativa && <p className="text-xs italic text-foreground/70">📝 "{dialogAction.tarefa.justificativa}"</p>}
                      <p className="text-xs text-muted-foreground">Por: {getNomeCrianca(dialogAction.tarefa.atribuida_a)}</p>
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