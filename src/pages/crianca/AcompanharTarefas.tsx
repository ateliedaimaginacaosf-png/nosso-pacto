import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { TarefaHistoricoSheet } from "@/components/TarefaHistoricoSheet";
import { InteracaoInput } from "@/components/InteracaoInput";
import { salvarInteracao } from "@/lib/interacao";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, CheckCircle2, Clock, AlertTriangle, Archive, ClipboardList, Coins, XCircle, Undo2, Star, Search, MessageSquare } from "lucide-react";
import { motion } from "framer-motion";
import { format, startOfWeek, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";
import { SuccessAnimation } from "@/components/SuccessAnimation";

type Tarefa = Tables<"tarefa">;
type StatusTarefa = "a_fazer" | "pendente_aprovacao" | "concluida" | "rejeitada" | "arquivada" | "dispensa_solicitada";
type StatusFiltro = "todos" | "a_fazer" | "nao_feita" | "pendente_aprovacao" | "concluida" | "rejeitada" | "dispensa_solicitada" | "arquivada";

type Periodo = "hoje" | "semana" | "mes";

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

export default function AcompanharTarefasCrianca() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [periodo, setPeriodo] = useState<Periodo>("hoje");
  const [searchParams] = useSearchParams();
  const [statusFiltros, setStatusFiltros] = useState<StatusFiltro[]>(["todos"]);
  const [selectedTarefa, setSelectedTarefa] = useState<Tarefa | null>(null);
  const [buscaTexto, setBuscaTexto] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("todas");
  const [showSuccess, setShowSuccess] = useState(false);
  const [successEmoji, setSuccessEmoji] = useState("✅");
  const [successMessage, setSuccessMessage] = useState("");

  // Dialog states for child actions
  const [comentarTarefaId, setComentarTarefaId] = useState<string | null>(null);
  const [mensagemComentario, setMensagemComentario] = useState("");
  const [fotoComentario, setFotoComentario] = useState<File | null>(null);
  const [dispensaTarefaId, setDispensaTarefaId] = useState<string | null>(null);
  const [justificativaDispensa, setJustificativaDispensa] = useState("");
  const [fotoDispensa, setFotoDispensa] = useState<File | null>(null);

  useEffect(() => {
    const statusParam = searchParams.get("status");
    if (statusParam) {
      const statuses = statusParam.split(",").filter(s =>
        ["a_fazer", "pendente_aprovacao", "concluida", "rejeitada", "dispensa_solicitada", "arquivada", "nao_feita"].includes(s)
      ) as StatusFiltro[];
      if (statuses.length > 0) setStatusFiltros(statuses);
    }
  }, [searchParams]);

  const dateRange = getDateRange(periodo);

  const { data: tarefas, isLoading } = useQuery({
    queryKey: ["acompanhar-tarefas-crianca", profile?.user_id, dateRange.start, dateRange.end],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tarefa")
        .select("*")
        .eq("atribuida_a", profile!.user_id)
        .gte("data_prevista", dateRange.start)
        .lte("data_prevista", dateRange.end)
        .order("data_prevista", { ascending: true });
      if (error) throw error;
      return data as Tarefa[];
    },
    enabled: !!profile,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["acompanhar-tarefas-crianca"] });
    queryClient.invalidateQueries({ queryKey: ["minhas-tarefas"] });
    queryClient.invalidateQueries({ queryKey: ["crianca-stats"] });
  };

  // Concluir tarefa (child marks as done)
  const concluirMutation = useMutation({
    mutationFn: async (tarefaId: string) => {
      const tarefa = tarefas?.find(t => t.id === tarefaId);
      const statusAnterior = tarefa?.status ?? "a_fazer";
      const { error } = await supabase
        .from("tarefa")
        .update({ status: "pendente_aprovacao" as StatusTarefa, data_conclusao: new Date().toISOString() })
        .eq("id", tarefaId);
      if (error) throw error;
      await salvarInteracao({
        tarefaId, familiaId: profile!.familia_id, userId: profile!.user_id,
        statusAnterior, statusNovo: "pendente_aprovacao", mensagem: "", foto: null,
      });
    },
    onSuccess: () => {
      invalidateAll();
      setSuccessEmoji("🎉");
      setSuccessMessage("Tarefa concluída!");
      setShowSuccess(true);
      toast({ title: "Tarefa concluída! 🎉" });
    },
    onError: () => toast({ title: "Erro ao concluir tarefa", variant: "destructive" }),
  });

  // Comentar
  const comentarMutation = useMutation({
    mutationFn: async ({ tarefaId, mensagem, foto }: { tarefaId: string; mensagem: string; foto: File | null }) => {
      const tarefa = tarefas?.find(t => t.id === tarefaId);
      if (!tarefa) throw new Error("Tarefa não encontrada");
      const { error } = await supabase.from("tarefa").update({ justificativa: mensagem || null }).eq("id", tarefaId);
      if (error) throw error;
      await salvarInteracao({
        tarefaId, familiaId: profile!.familia_id, userId: profile!.user_id,
        statusAnterior: tarefa.status, statusNovo: tarefa.status, mensagem, foto,
      });
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Comentário enviado! 💬" });
      setComentarTarefaId(null);
      setMensagemComentario("");
      setFotoComentario(null);
    },
    onError: () => toast({ title: "Erro ao enviar comentário", variant: "destructive" }),
  });

  // Pedir dispensa
  const dispensaMutation = useMutation({
    mutationFn: async ({ tarefaId, justificativa, foto }: { tarefaId: string; justificativa: string; foto: File | null }) => {
      const { error } = await supabase
        .from("tarefa")
        .update({ status: "dispensa_solicitada" as StatusTarefa, justificativa })
        .eq("id", tarefaId);
      if (error) throw error;
      await salvarInteracao({
        tarefaId, familiaId: profile!.familia_id, userId: profile!.user_id,
        statusAnterior: "a_fazer", statusNovo: "dispensa_solicitada", mensagem: justificativa, foto,
      });
    },
    onSuccess: () => {
      invalidateAll();
      setSuccessEmoji("🙏");
      setSuccessMessage("Pedido de dispensa enviado!");
      setShowSuccess(true);
      toast({ title: "Pedido enviado! 🙏" });
      setDispensaTarefaId(null);
      setJustificativaDispensa("");
      setFotoDispensa(null);
    },
    onError: () => toast({ title: "Erro ao pedir dispensa", variant: "destructive" }),
  });

  const filtradas = useMemo(() => {
    return (tarefas ?? []).filter((t) => {
      const effective = getEffectiveStatus(t);
      if (!statusFiltros.includes("todos") && !statusFiltros.some(s => s === effective)) return false;
      if (filtroCategoria !== "todas" && t.categoria !== filtroCategoria) return false;
      if (buscaTexto) {
        const search = buscaTexto.toLowerCase();
        if (!t.nome.toLowerCase().includes(search) && !(t.descricao ?? "").toLowerCase().includes(search)) return false;
      }
      return true;
    });
  }, [tarefas, statusFiltros, filtroCategoria, buscaTexto]);

  // Lost coins
  const naoFeitas = (tarefas ?? []).filter((t) => getEffectiveStatus(t) === "nao_feita");
  const totalMoedasPerdidas = naoFeitas.reduce((sum, t) => sum + t.valor_moedas, 0);

  const getActionButtons = (t: Tarefa) => {
    const effective = getEffectiveStatus(t);
    if (effective === "a_fazer" || effective === "rejeitada") {
      return (
        <div className="flex flex-col gap-1 shrink-0">
          <Button size="sm" onClick={(e) => { e.stopPropagation(); concluirMutation.mutate(t.id); }} disabled={concluirMutation.isPending} className="text-xs">
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Feito!
          </Button>
          <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setComentarTarefaId(t.id); setMensagemComentario(""); setFotoComentario(null); }} className="text-xs">
            <MessageSquare className="h-3.5 w-3.5 mr-1" /> Comentar
          </Button>
          <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setDispensaTarefaId(t.id); }} className="text-xs">
            🙏 Dispensa
          </Button>
        </div>
      );
    }
    if (effective === "pendente_aprovacao" || effective === "dispensa_solicitada") {
      return (
        <div className="flex flex-col gap-1 shrink-0">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" /> Em validação
          </div>
          {effective === "pendente_aprovacao" && (
            <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setComentarTarefaId(t.id); setMensagemComentario(""); setFotoComentario(null); }} className="text-xs">
              <MessageSquare className="h-3.5 w-3.5 mr-1" /> Comentar
            </Button>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <>
      <SuccessAnimation show={showSuccess} emoji={successEmoji} message={successMessage} onComplete={() => setShowSuccess(false)} />
      <AppLayout>
        <div className="space-y-6">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="font-display text-2xl font-bold md:text-3xl">Acompanhar Tarefas 📋</h1>
            <p className="text-muted-foreground">Visualize todas as suas tarefas</p>
          </motion.div>

          {/* Lost coins */}
          {!isLoading && totalMoedasPerdidas > 0 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <Card className="border-destructive/30 bg-destructive/5">
                <CardContent className="py-3">
                  <div className="flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-destructive" />
                    <p className="text-sm font-semibold text-destructive">
                      Moedas perdidas: {totalMoedasPerdidas} 🪙
                    </p>
                    <span className="text-xs text-muted-foreground">({naoFeitas.length} tarefa{naoFeitas.length !== 1 ? "s" : ""} não feita{naoFeitas.length !== 1 ? "s" : ""})</span>
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

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-44 justify-start text-left font-normal">
                  {statusFiltros.includes("todos") ? "Todos os status" : `${statusFiltros.length} status`}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-2" align="start">
                <div className="space-y-1">
                  {[
                    { value: "todos", label: "Todos os status" },
                    { value: "a_fazer", label: "A fazer" },
                    { value: "nao_feita", label: "Não feita" },
                    { value: "pendente_aprovacao", label: "Em validação" },
                    { value: "concluida", label: "Concluída" },
                    { value: "rejeitada", label: "Rejeitada" },
                    { value: "dispensa_solicitada", label: "Dispensa solicitada" },
                    { value: "arquivada", label: "Dispensada" },
                  ].map(opt => (
                    <label key={opt.value} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted cursor-pointer">
                      <Checkbox
                        checked={opt.value === "todos" ? statusFiltros.includes("todos") : statusFiltros.includes(opt.value as StatusFiltro)}
                        onCheckedChange={(checked) => {
                          if (opt.value === "todos") {
                            setStatusFiltros(["todos"]);
                          } else {
                            setStatusFiltros(prev => {
                              const without = prev.filter(s => s !== "todos" && s !== opt.value);
                              if (checked) {
                                const next = [...without, opt.value as StatusFiltro];
                                return next.length === 0 ? ["todos"] : next;
                              } else {
                                return without.length === 0 ? ["todos"] : without;
                              }
                            });
                          }
                        }}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

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
                      <CardContent className="py-3">
                        <div className="flex items-start gap-3">
                          <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-muted ${cfg.color} shrink-0`}>
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
                        </div>
                        <div className="flex justify-end mt-2">
                          {getActionButtons(t)}
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          )}

          {/* Dialog: Comentar */}
          <Dialog open={!!comentarTarefaId} onOpenChange={(o) => { if (!o) { setComentarTarefaId(null); setMensagemComentario(""); setFotoComentario(null); } }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-display">Enviar Comentário 💬</DialogTitle>
              </DialogHeader>
              <InteracaoInput
                label="Mensagem para o responsável"
                placeholder="Conte como você fez a tarefa..."
                mensagem={mensagemComentario}
                onMensagemChange={setMensagemComentario}
                foto={fotoComentario}
                onFotoChange={setFotoComentario}
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => { setComentarTarefaId(null); setMensagemComentario(""); setFotoComentario(null); }}>Cancelar</Button>
                <Button
                  onClick={() => comentarTarefaId && (mensagemComentario.trim() || fotoComentario) && comentarMutation.mutate({ tarefaId: comentarTarefaId, mensagem: mensagemComentario, foto: fotoComentario })}
                  disabled={comentarMutation.isPending || (!mensagemComentario.trim() && !fotoComentario)}
                >
                  {comentarMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enviar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Dialog: Pedir dispensa */}
          <Dialog open={!!dispensaTarefaId} onOpenChange={(o) => { if (!o) { setDispensaTarefaId(null); setJustificativaDispensa(""); setFotoDispensa(null); } }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-display">Pedir Dispensa 🙏</DialogTitle>
              </DialogHeader>
              <InteracaoInput
                label="Por que você não pode fazer essa tarefa? *"
                placeholder="Explique o motivo..."
                mensagem={justificativaDispensa}
                onMensagemChange={setJustificativaDispensa}
                foto={fotoDispensa}
                onFotoChange={setFotoDispensa}
                required
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => { setDispensaTarefaId(null); setJustificativaDispensa(""); setFotoDispensa(null); }}>Cancelar</Button>
                <Button
                  onClick={() => dispensaTarefaId && justificativaDispensa.trim() && dispensaMutation.mutate({ tarefaId: dispensaTarefaId, justificativa: justificativaDispensa, foto: fotoDispensa })}
                  disabled={dispensaMutation.isPending || !justificativaDispensa.trim()}
                >
                  {dispensaMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enviar Pedido"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Task History Sheet */}
          <TarefaHistoricoSheet
            tarefa={selectedTarefa}
            onClose={() => setSelectedTarefa(null)}
            getNomeUsuario={(userId) => {
              if (!userId) return "Sem atribuição";
              if (userId === profile?.user_id) return profile?.nome ?? "Eu";
              return "Responsável";
            }}
          />
        </div>
      </AppLayout>
    </>
  );
}
