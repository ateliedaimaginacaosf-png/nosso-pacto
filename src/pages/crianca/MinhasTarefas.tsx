import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, CheckCircle2, Clock, Coins, Loader2, Filter, Plus } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { TarefaHistoricoSheet } from "@/components/TarefaHistoricoSheet";
import { InteracaoInput } from "@/components/InteracaoInput";
import { salvarInteracao } from "@/lib/interacao";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "@/hooks/use-toast";
import { useState, useMemo } from "react";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Tables } from "@/integrations/supabase/types";

type Tarefa = Tables<"tarefa">;

interface TarefaPadrao {
  id: string;
  nome: string;
  descricao: string | null;
  categoria: string;
  valor_moedas: number;
}

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
  arquivada: { label: "Dispensada", variant: "outline" },
};

type FiltroPeriodo = "dia" | "semana" | "mes";
type AbaTarefa = "a_fazer" | "aguardando" | "concluidas";
type StatusTarefa = "a_fazer" | "pendente_aprovacao" | "concluida" | "rejeitada" | "arquivada" | "dispensa_solicitada";

const statusMap: Record<AbaTarefa, StatusTarefa[]> = {
  a_fazer: ["a_fazer", "rejeitada"],
  aguardando: ["pendente_aprovacao", "dispensa_solicitada"],
  concluidas: ["concluida", "arquivada"],
};

export default function MinhasTarefas() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [filtroPeriodo, setFiltroPeriodo] = useState<FiltroPeriodo>("dia");
  const [abaAtiva, setAbaAtiva] = useState<AbaTarefa>("a_fazer");

  // Dialog states
  const [concluirTarefaId, setConcluirTarefaId] = useState<string | null>(null);
  const [mensagemConclusao, setMensagemConclusao] = useState("");
  const [fotoConclusao, setFotoConclusao] = useState<File | null>(null);
  const [dispensaTarefaId, setDispensaTarefaId] = useState<string | null>(null);
  const [justificativaDispensa, setJustificativaDispensa] = useState("");
  const [fotoDispensa, setFotoDispensa] = useState<File | null>(null);
  const [selectedTarefa, setSelectedTarefa] = useState<Tarefa | null>(null);

  // Extra task dialog state
  const [extraDialogOpen, setExtraDialogOpen] = useState(false);
  const [extraSelectedTemplate, setExtraSelectedTemplate] = useState<string>("__novo__");
  const [extraNome, setExtraNome] = useState("");
  const [extraDescricao, setExtraDescricao] = useState("");
  const [extraMensagem, setExtraMensagem] = useState("");
  const [extraFoto, setExtraFoto] = useState<File | null>(null);

  const { data: templates } = useQuery({
    queryKey: ["tarefa-padrao", profile?.familia_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tarefa_padrao").select("*")
        .eq("familia_id", profile!.familia_id);
      if (error) throw error;
      return data as TarefaPadrao[];
    },
    enabled: !!profile,
  });

  const resetExtraForm = () => {
    setExtraSelectedTemplate("__novo__");
    setExtraNome("");
    setExtraDescricao("");
    setExtraMensagem("");
    setExtraFoto(null);
  };

  const criarTarefaExtra = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error("Sem perfil");
      const isTemplate = extraSelectedTemplate !== "__novo__";
      const template = isTemplate ? templates?.find(t => t.id === extraSelectedTemplate) : null;

      const nome = isTemplate && template ? template.nome : extraNome.trim();
      if (!nome) throw new Error("Nome obrigatório");

      const tarefaData = {
        nome,
        descricao: isTemplate && template ? template.descricao : (extraDescricao.trim() || null),
        categoria: (isTemplate && template ? template.categoria : "outros") as "limpeza" | "estudos" | "exercicio" | "higiene" | "alimentacao" | "organizacao" | "outros",
        valor_moedas: isTemplate && template ? template.valor_moedas : 0,
        atribuida_a: profile.user_id,
        familia_id: profile.familia_id,
        criada_por: profile.user_id,
        data_prevista: format(new Date(), "yyyy-MM-dd"),
        status: "pendente_aprovacao" as const,
        data_conclusao: new Date().toISOString(),
        tarefa_extra: true,
        justificativa: extraMensagem.trim() || null,
      };

      const { data: novaTarefa, error } = await supabase.from("tarefa").insert(tarefaData).select("id").single();
      if (error) throw error;

      await salvarInteracao({
        tarefaId: novaTarefa.id,
        familiaId: profile.familia_id,
        userId: profile.user_id,
        statusAnterior: null,
        statusNovo: "pendente_aprovacao",
        mensagem: extraMensagem.trim() || `Tarefa extra: ${nome}`,
        foto: extraFoto,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["minhas-tarefas"] });
      queryClient.invalidateQueries({ queryKey: ["crianca-stats"] });
      toast({ title: "Tarefa extra enviada! ⭐", description: "Aguardando avaliação do responsável." });
      setExtraDialogOpen(false);
      resetExtraForm();
    },
    onError: (e) => toast({ title: "Erro ao registrar tarefa", description: String(e), variant: "destructive" }),
  });

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
    mutationFn: async ({ tarefaId, mensagem, foto }: { tarefaId: string; mensagem: string; foto: File | null }) => {
      const tarefa = tarefasAFazer?.find(t => t.id === tarefaId);
      const statusAnterior = tarefa?.status ?? "a_fazer";

      const { error } = await supabase
        .from("tarefa")
        .update({
          status: "pendente_aprovacao" as StatusTarefa,
          data_conclusao: new Date().toISOString(),
          justificativa: mensagem || null,
        })
        .eq("id", tarefaId);
      if (error) throw error;

      await salvarInteracao({
        tarefaId,
        familiaId: profile!.familia_id,
        userId: profile!.user_id,
        statusAnterior,
        statusNovo: "pendente_aprovacao",
        mensagem,
        foto,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["minhas-tarefas"] });
      queryClient.invalidateQueries({ queryKey: ["crianca-stats"] });
      toast({ title: "Tarefa enviada! ✅", description: "Aguardando aprovação do responsável." });
      setConcluirTarefaId(null);
      setMensagemConclusao("");
      setFotoConclusao(null);
    },
    onError: () => toast({ title: "Erro", description: "Não foi possível concluir a tarefa.", variant: "destructive" }),
  });

  const dispensaMutation = useMutation({
    mutationFn: async ({ tarefaId, justificativa, foto }: { tarefaId: string; justificativa: string; foto: File | null }) => {
      const { error } = await supabase
        .from("tarefa")
        .update({
          status: "dispensa_solicitada" as StatusTarefa,
          justificativa: justificativa,
        })
        .eq("id", tarefaId);
      if (error) throw error;

      await salvarInteracao({
        tarefaId,
        familiaId: profile!.familia_id,
        userId: profile!.user_id,
        statusAnterior: "a_fazer",
        statusNovo: "dispensa_solicitada",
        mensagem: justificativa,
        foto,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["minhas-tarefas"] });
      queryClient.invalidateQueries({ queryKey: ["crianca-stats"] });
      toast({ title: "Pedido enviado! 🙏", description: "Aguardando resposta do responsável." });
      setDispensaTarefaId(null);
      setJustificativaDispensa("");
      setFotoDispensa(null);
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
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-xl shrink-0 mt-0.5 cursor-pointer" onClick={() => setSelectedTarefa(tarefa)}>
            {categoriasEmoji[tarefa.categoria] ?? "⭐"}
          </div>
          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setSelectedTarefa(tarefa)}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-display font-semibold text-sm truncate">{tarefa.nome}</span>
              <Badge 
                variant={statusLabel[tarefa.status]?.variant ?? "outline"} 
                className={`text-[10px] ${tarefa.status === "arquivada" ? "border-muted-foreground/50 text-muted-foreground" : ""}`}
              >
                {statusLabel[tarefa.status]?.label ?? tarefa.status}
              </Badge>
              {tarefa.tarefa_extra && (
                <Badge variant="outline" className="text-[10px] border-accent text-accent-foreground">Extra</Badge>
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
              {tarefa.status === "arquivada" || (tarefa.status === "a_fazer" && tarefa.data_prevista && new Date(tarefa.data_prevista + "T23:59:59") < new Date()) ? (
                <span className="flex items-center gap-0.5 text-muted-foreground/60 line-through">{tarefa.valor_moedas} 🪙</span>
              ) : (
                <span className="flex items-center gap-0.5 font-semibold text-coin-foreground">
                  <Coins className="h-3 w-3 text-coin" /> {tarefa.valor_moedas}
                </span>
              )}
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

        {/* Period filter + Extra task button */}
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
          <Button size="sm" className="ml-auto" onClick={() => { resetExtraForm(); setExtraDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Tarefa Extra
          </Button>
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

        {/* Dialog: Concluir tarefa */}
        <Dialog open={!!concluirTarefaId} onOpenChange={(o) => { if (!o) { setConcluirTarefaId(null); setMensagemConclusao(""); setFotoConclusao(null); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-display">Marcar como Feito ✅</DialogTitle>
            </DialogHeader>
            <InteracaoInput
              label="Mensagem para o responsável (opcional)"
              placeholder="Conte como você fez a tarefa..."
              mensagem={mensagemConclusao}
              onMensagemChange={setMensagemConclusao}
              foto={fotoConclusao}
              onFotoChange={setFotoConclusao}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => { setConcluirTarefaId(null); setMensagemConclusao(""); setFotoConclusao(null); }}>Cancelar</Button>
              <Button
                onClick={() => concluirTarefaId && concluirMutation.mutate({ tarefaId: concluirTarefaId, mensagem: mensagemConclusao, foto: fotoConclusao })}
                disabled={concluirMutation.isPending}
              >
                {concluirMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enviar"}
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

        {/* Dialog: Tarefa Extra */}
        <Dialog open={extraDialogOpen} onOpenChange={(o) => { if (!o) { setExtraDialogOpen(false); resetExtraForm(); } }}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display">Registrar Tarefa Extra ⭐</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Selecionar tarefa</Label>
                <Select value={extraSelectedTemplate} onValueChange={setExtraSelectedTemplate}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__novo__">✨ Nova tarefa (não está na lista)</SelectItem>
                    {templates?.map(t => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.nome} ({t.valor_moedas} 🪙)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {extraSelectedTemplate === "__novo__" && (
                <>
                  <div>
                    <Label>Nome da tarefa *</Label>
                    <Input placeholder="O que você fez?" value={extraNome} onChange={e => setExtraNome(e.target.value)} />
                  </div>
                  <div>
                    <Label>Descrição (opcional)</Label>
                    <Textarea placeholder="Descreva o que fez..." value={extraDescricao} onChange={e => setExtraDescricao(e.target.value)} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    O responsável vai definir a categoria e as moedas dessa tarefa.
                  </p>
                </>
              )}

              {extraSelectedTemplate !== "__novo__" && (() => {
                const tpl = templates?.find(t => t.id === extraSelectedTemplate);
                return tpl ? (
                  <div className="rounded-lg bg-muted p-3 text-sm">
                    <p><strong>{tpl.nome}</strong></p>
                    {tpl.descricao && <p className="text-muted-foreground text-xs mt-1">{tpl.descricao}</p>}
                    <p className="mt-1 flex items-center gap-1 text-coin-foreground font-semibold">
                      <Coins className="h-3 w-3 text-coin" /> {tpl.valor_moedas} moedas
                    </p>
                  </div>
                ) : null;
              })()}

              <InteracaoInput
                label="Mensagem para o responsável (opcional)"
                placeholder="Conte o que fez e por quê..."
                mensagem={extraMensagem}
                onMensagemChange={setExtraMensagem}
                foto={extraFoto}
                onFotoChange={setExtraFoto}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setExtraDialogOpen(false); resetExtraForm(); }}>Cancelar</Button>
              <Button
                onClick={() => criarTarefaExtra.mutate()}
                disabled={criarTarefaExtra.isPending || (extraSelectedTemplate === "__novo__" && !extraNome.trim())}
              >
                {criarTarefaExtra.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enviar para Avaliação"}
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
  );
}
